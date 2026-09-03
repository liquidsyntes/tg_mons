# Scripts

This directory contains utility scripts for database inspection and debugging.

## Usage

```bash
# Example: Running a script using ts-node or Next.js tsx environment
npx tsx scripts/check_db.ts
```

## Available Scripts

- **check_db.ts**: Prints the latest generated `super_report` from the DB.
- **check_db_stats.ts**: Inspects database metrics/stats.
- **check_gramjs.ts**: Utility to verify Telegram GramJS client authentication.
- **rematerialize.ts**: Runs manual metrics materialization.
- **inspect_msg.ts**, **query_posts.ts**, **test_scrape.ts**: Local dev debugging utilities for scraping and Telegram messages.

*Note: One-off dev scripts should be placed here, never in the root directory.*
