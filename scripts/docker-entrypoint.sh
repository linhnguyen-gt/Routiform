#!/bin/sh
# Docker entrypoint: if first arg is a management noun, run CLI; else start server.
set -e

MANAGEMENT_NOUNS="provider key combo model settings status usage logs"

is_management_noun() {
  for noun in $MANAGEMENT_NOUNS; do
    [ "$1" = "$noun" ] && return 0
  done
  return 1
}

if [ $# -gt 0 ] && is_management_noun "$1"; then
  exec routiform "$@"
else
  exec node run-standalone.mjs "$@"
fi