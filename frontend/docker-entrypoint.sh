#!/bin/sh
set -e

envsubst '${METADATA_URL} ${STORAGE_1_URL} ${STORAGE_2_URL} ${STORAGE_3_URL} ${STORAGE_4_URL}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
