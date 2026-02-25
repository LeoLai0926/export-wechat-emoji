use aes::Aes256;
use cbc::cipher::block_padding::NoPadding;
use cbc::cipher::{BlockDecryptMut, KeyIvInit};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac_array;
use rusqlite::Connection;
use sha2::Sha512;
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

fn normalize_hex_key(input: &str) -> anyhow::Result<String> {
    let trimmed = input.trim();
    let no_prefix = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"));
    let key = no_prefix.unwrap_or(trimmed).trim().to_ascii_lowercase();
    anyhow::ensure!(key.len() == 64, "db key must be 64 hex chars (32 bytes)");
    anyhow::ensure!(key.chars().all(|c| c.is_ascii_hexdigit()), "db key must be hex");
    Ok(key)
}

fn decrypt_db_file_v4(path: &Path, pkey_hex: &str) -> anyhow::Result<Vec<u8>> {
    const IV_SIZE: usize = 16;
    const HMAC_SHA512_SIZE: usize = 64;
    const KEY_SIZE: usize = 32;
    const AES_BLOCK_SIZE: usize = 16;
    const ROUND_COUNT: u32 = 256_000;
    const PAGE_SIZE: usize = 4096;
    const SALT_SIZE: usize = 16;
    const SQLITE_HEADER: &[u8] = b"SQLite format 3";

    let mut buf = std::fs::read(path)?;
    if buf.starts_with(SQLITE_HEADER) {
        return Ok(buf);
    }
    anyhow::ensure!(buf.len() >= PAGE_SIZE && buf.len() % PAGE_SIZE == 0, "invalid encrypted db size");

    let salt = buf[..SALT_SIZE].to_vec();
    let mac_salt: Vec<u8> = salt.iter().map(|b| b ^ 0x3a).collect();

    let pass = hex::decode(pkey_hex)?;
    let key = pbkdf2_hmac_array::<Sha512, KEY_SIZE>(&pass, &salt, ROUND_COUNT);
    let mac_key = pbkdf2_hmac_array::<Sha512, KEY_SIZE>(&key, &mac_salt, 2);

    // SQLCipher reserved bytes per page are IV + HMAC, aligned to AES block size.
    let mut reserve = IV_SIZE + HMAC_SHA512_SIZE;
    if reserve % AES_BLOCK_SIZE != 0 {
        reserve = ((reserve / AES_BLOCK_SIZE) + 1) * AES_BLOCK_SIZE;
    }

    let total_pages = buf.len() / PAGE_SIZE;
    let mut decrypted = Vec::<u8>::with_capacity(buf.len());

    // Page 1 starts with the 16-byte SQLite header.
    decrypted.extend_from_slice(SQLITE_HEADER);
    decrypted.push(0x00);

    type HmacSha512 = Hmac<Sha512>;
    type Aes256CbcDec = cbc::Decryptor<Aes256>;

    for cur_page in 0..total_pages {
        let offset = if cur_page == 0 { SALT_SIZE } else { 0 };
        let start = cur_page * PAGE_SIZE;
        let end = start + PAGE_SIZE;

        let iv_start = end - reserve;
        let iv_end = iv_start + IV_SIZE;
        let hmac_start = iv_start + IV_SIZE;
        let hmac_end = hmac_start + HMAC_SHA512_SIZE;
        anyhow::ensure!(hmac_end <= end, "invalid db reserve region");

        let mut mac = HmacSha512::new_from_slice(&mac_key)?;
        mac.update(&buf[start + offset..iv_start + IV_SIZE]);
        mac.update(&((cur_page as u32) + 1).to_le_bytes());
        let expected = mac.finalize().into_bytes();
        anyhow::ensure!(expected.as_slice() == &buf[hmac_start..hmac_end], "db key mismatch (HMAC verification failed)");

        let iv = &buf[iv_start..iv_end];
        let decrypted_page = Aes256CbcDec::new(&key.into(), iv.into())
            .decrypt_padded_mut::<NoPadding>(&mut buf[start + offset..iv_start])
            .map_err(|e| anyhow::anyhow!("decrypt failed: {e:?}"))?;
        decrypted.extend_from_slice(decrypted_page);
        decrypted.extend_from_slice(&buf[iv_start..end]);
    }

    Ok(decrypted)
}

fn push_urls_from_string(value: &str, out: &mut Vec<String>, seen: &mut HashSet<String>) {
    let mut start = 0usize;
    while start < value.len() {
        let remainder = &value[start..];
        let http_index = remainder.find("http://");
        let https_index = remainder.find("https://");
        let next = match (http_index, https_index) {
            (None, None) => break,
            (Some(i), None) => i,
            (None, Some(i)) => i,
            (Some(a), Some(b)) => a.min(b),
        };

        let absolute_start = start + next;
        let after_scheme = &value[absolute_start..];
        let end = after_scheme
            .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '<' | '>' | '\\'))
            .map(|i| absolute_start + i)
            .unwrap_or_else(|| value.len());

        if end > absolute_start {
            let url = value[absolute_start..end].to_string();
            if seen.insert(url.clone()) {
                out.push(url);
            }
        }

        start = end;
    }
}

fn normalize_extracted_url(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("http://") {
        return format!("https://{rest}");
    }
    url.to_string()
}

fn score_emoticon_url(url: &str) -> i32 {
    let u = url.to_ascii_lowercase();
    let mut score = 0i32;
    if u.starts_with("https://") {
        score += 20;
    }
    if u.contains("/stodownload") {
        score += 1000;
    }
    if u.contains("wxapp.tc.qq.com") {
        score += 500;
    } else if u.contains("vweixinf.tc.qq.com") {
        score += 400;
    }
    if u.contains("filekey=") {
        score += 100;
    }
    if u.contains("m=") {
        score += 50;
    }
    if u.contains("mmbiz.qpic.cn") {
        score -= 300;
    }
    if u.contains("/mmemoticon/") {
        score -= 100;
    }
    score
}

fn best_emoticon_url_from_fields(fields: &[Option<String>]) -> Option<String> {
    let mut candidates = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();
    for f in fields {
        if let Some(s) = f {
            push_urls_from_string(s, &mut candidates, &mut seen);
        }
    }
    if candidates.is_empty() {
        return None;
    }

    let mut best: Option<(i32, String)> = None;
    for c in candidates {
        let url = normalize_extracted_url(&c);
        let score = score_emoticon_url(&url);
        match &best {
            None => best = Some((score, url)),
            Some((best_score, best_url)) => {
                if score > *best_score || (score == *best_score && url.len() > best_url.len()) {
                    best = Some((score, url));
                }
            }
        }
    }
    best.map(|(_, u)| u)
}

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let db = args
        .next()
        .ok_or_else(|| anyhow::anyhow!("usage: extract-emoticon-urls <emoticon.db> <db_key_hex>"))?;
    let key = args
        .next()
        .ok_or_else(|| anyhow::anyhow!("usage: extract-emoticon-urls <emoticon.db> <db_key_hex>"))?;

    let db_path = PathBuf::from(db);
    anyhow::ensure!(db_path.exists(), "emoticon.db not found: {}", db_path.display());

    let key = normalize_hex_key(&key)?;
    let decrypted = decrypt_db_file_v4(&db_path, &key)?;

    let mut tmp = NamedTempFile::new()?;
    tmp.write_all(&decrypted)?;
    tmp.flush()?;

    let conn = Connection::open(tmp.path())?;

    // Print tables to help debug schema changes.
    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")?;
    let tables = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    eprintln!("tables: {}", tables.join(", "));

    let mut urls = Vec::<String>::new();
    let mut seen_md5 = HashSet::<String>::new();

    // Prefer order tables so we match the emoji panel (one URL per md5).
    // Prefer "Fav" first.
    let order_tables = ["kFavEmoticonOrderTable", "kCustomEmoticonOrderTable"];
    for table in order_tables {
        let sql = format!(
            "SELECT o.md5, n.thumb_url, n.tp_url, n.cdn_url, n.extern_url, n.encrypt_url \
             FROM {table} o LEFT JOIN kNonStoreEmoticonTable n ON o.md5 = n.md5 \
             ORDER BY o.rowid"
        );
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;

        let before = urls.len();
        for row in rows {
            let (md5, thumb, tp, cdn, extern_url, encrypt_url) = row?;
            if md5.trim().is_empty() {
                continue;
            }
            if seen_md5.contains(&md5) {
                continue;
            }
            if let Some(best) = best_emoticon_url_from_fields(&[
                cdn,
                tp,
                thumb,
                extern_url,
                encrypt_url,
            ]) {
                seen_md5.insert(md5);
                urls.push(best);
            }
        }
        if urls.len() > before {
            break;
        }
    }

    eprintln!("collected urls: {}", urls.len());
    for u in urls {
        println!("{u}");
    }

    Ok(())
}
