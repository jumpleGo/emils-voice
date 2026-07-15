# emils-voice

Claude Code скилл, который пишет любой текст голосом Эмиля Латыпова — на основе его реальных постов в Threads, LinkedIn и транскриптов YouTube-стримов.

Стиль выжимается из корпуса в `voice-profile.md` + эталоны в `examples/`. В рантайме скилл грузит эти файлы и применяет голос — без вызовов API.

## Установка

Скопируй папку в `.claude/skills/emils-voice/` нужного проекта (или в `~/.claude/skills/` для глобального доступа).

## Первичная сборка

```bash
export SCRAPECREATORS_API_KEY=...     # ключ app.scrapecreators.com
node tools/collect.mjs --probe        # проверка
node tools/collect.mjs                # сбор корпуса → corpus/corpus.md
```

Дальше Claude строит `voice-profile.md` из корпуса. Полный порядок сборки и обновления — в `docs/building.md`.

## Использование

В любом проекте со скиллом:

```
/emils-voice перепиши этот текст моим голосом: ...
```

Источники голоса настраиваются в `config.json`.
