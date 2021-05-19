#!/bin/bash

TXN_FILE=untag.txn

../sandbox goal clerk dryrun -t $TXN_FILE -o $TXN_FILE.json --dryrun-dump
../sandbox exec "cat $TXN_FILE.json" > $TXN_FILE.json
tealdbg debug platform-approval.teal -i 'http://localhost:8980' -d $TXN_FILE.json
