#!/bin/bash
set -euo pipefail
umask 077
mkdir -p /var/backups/tokfire
backup_file="/var/backups/tokfire/tokfire-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
trap 'rm -f "$backup_file.partial"' EXIT
mysqldump --defaults-extra-file=/etc/tokfire-mysql.cnf --single-transaction --no-tablespaces --set-gtid-purged=OFF tokfire_bench | gzip > "$backup_file.partial"
gzip -t "$backup_file.partial"
mv "$backup_file.partial" "$backup_file"
find /var/backups/tokfire -type f -name 'tokfire-*.sql.gz' -mtime +7 -delete
