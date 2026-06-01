#!/usr/bin/env node
// Сборщик корпуса для emils-voice.
// Тянет посты Threads, LinkedIn и транскрипты YouTube через ScrapeCreators API,
// складывает сырьё в corpus/ и собирает единый corpus.md для анализа голоса.
//
// Запуск:  SCRAPECREATORS_API_KEY=... node tools/collect.mjs
// Пробный: node tools/collect.mjs --probe   (один минимальный запрос, проверка ключа и формата)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://api.scrapecreators.com";
const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const PROBE = process.argv.includes("--probe");

if (!API_KEY) {
  console.error("Нет SCRAPECREATORS_API_KEY в окружении. Положи ключ в .env или экспортируй переменную.");
  process.exit(1);
}

// Универсальный GET к API с обработкой типичных кодов
async function api(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
  if (res.status === 401) throw new Error("401: неверный API-ключ");
  if (res.status === 402) throw new Error("402: закончились кредиты");
  if (!res.ok) throw new Error(`${res.status}: ${path} → ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// --- Threads: листаем посты пользователя с пагинацией по курсору ---
async function collectThreads(handle, maxPages) {
  const posts = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const data = await api("/v1/threads/user/posts", { handle, cursor });
    const batch = data.posts || data.threads || data.data || [];
    posts.push(...batch);
    cursor = data.next_cursor || data.cursor || data.nextMaxId;
    console.log(`  Threads: страница ${page + 1}, всего постов ${posts.length}`);
    if (!cursor || batch.length === 0) break;
  }
  return posts;
}

// --- LinkedIn: профиль включает недавние посты ---
async function collectLinkedIn(profileUrl) {
  const data = await api("/v1/linkedin/profile", { url: profileUrl });
  return data;
}

// --- YouTube: транскрипт по url видео ---
async function collectYouTube(videoUrl) {
  return api("/v1/youtube/video/transcript", { url: videoUrl, language: "ru" });
}

// Достаёт текст поста из разных возможных полей ответа
function postText(p) {
  return p.caption || p.text || p.content || p.body || p.commentary || "";
}

async function main() {
  const config = JSON.parse(await readFile(join(ROOT, "config.json"), "utf8"));
  await mkdir(join(ROOT, "corpus"), { recursive: true });

  if (PROBE) {
    // Минимальная проверка: один транскрипт — самый дешёвый и предсказуемый запрос
    const yt = await collectYouTube(config.youtube.videos[0]);
    console.log("Пробный запрос ок. Ключи ответа:", Object.keys(yt).join(", "));
    console.log("Начало транскрипта:", (yt.transcript_only_text || "").slice(0, 200));
    return;
  }

  const sections = [];

  console.log("Threads…");
  const threads = await collectThreads(config.threads.handle, config.limits.threadsPages);
  await writeFile(join(ROOT, "corpus/threads.json"), JSON.stringify(threads, null, 2));
  sections.push("# THREADS\n\n" + threads.map((p) => postText(p)).filter(Boolean).join("\n\n---\n\n"));

  console.log("LinkedIn…");
  const linkedin = await collectLinkedIn(config.linkedin.profileUrl);
  await writeFile(join(ROOT, "corpus/linkedin.json"), JSON.stringify(linkedin, null, 2));
  const liPosts = linkedin.posts || linkedin.activity || [];
  sections.push("# LINKEDIN\n\n" + liPosts.map((p) => postText(p)).filter(Boolean).join("\n\n---\n\n"));

  console.log("YouTube…");
  const ytTexts = [];
  for (const v of config.youtube.videos) {
    const t = await collectYouTube(v);
    const id = t.videoId || v.split("/").pop();
    await writeFile(join(ROOT, `corpus/youtube-${id}.json`), JSON.stringify(t, null, 2));
    ytTexts.push(`## ${v}\n\n${t.transcript_only_text || ""}`);
  }
  sections.push("# YOUTUBE TRANSCRIPTS\n\n" + ytTexts.join("\n\n---\n\n"));

  await writeFile(join(ROOT, "corpus/corpus.md"), sections.join("\n\n\n"));
  console.log("Готово. Корпус собран в corpus/corpus.md — теперь скилл строит из него voice-profile.md");
}

main().catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});
