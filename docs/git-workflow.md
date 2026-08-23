# Git Workflow — Solo Dev

## Начало новой задачи

```bash
git checkout main
git pull
git checkout -b feat/название-задачи
```

## Во время работы

Коммитить небольшими кусками, не копить:

```bash
git add .
git commit -m "краткое и понятное описание изменений на русском"
```

## Перед merge в main

Подтянуть свежий main в свою ветку:

```bash
git checkout main
git pull
git checkout feat/название-задачи
git merge main
# Решить конфликты если есть
# Протестировать что всё работает
```

## Влить в main

```bash
git checkout main
git merge --no-ff feat/название-задачи
git push
```

## Убрать использованную ветку

```bash
git branch -d feat/название-задачи
```

## Проверить историю

```bash
git log --graph --all --decorate --oneline --date-order
```

## Naming веток

| Префикс | Назначение |
|---------|-----------|
| `feat/` | Новый функционал |
| `fix/` | Баги |
| `refactor/` | Переработка кода |
| `chore/` | Зависимости, Prisma, конфиги |

## Правила

- Одна задача = одна ветка
- Ветка влита = ветку удалить
- Следующая задача = новая ветка от свежего main
- Никогда не коммитить напрямую в main
- `merge` для интеграции, `rebase` только для локальной уборки
