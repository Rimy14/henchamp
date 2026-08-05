# Vendor JavaScript Libraries

This directory contains third-party JavaScript libraries that are included locally for better reliability.

## jsrsasign-all-min.js

- **Version**: 11.1.0
- **Purpose**: Cryptographic library required for QZ Tray certificate signing
- **Source**: https://github.com/kjur/jsrsasign
- **License**: MIT
- **Why local**: CDN loading was unreliable, causing certificate signing failures

### Usage

This library provides cryptographic functions (KEYUTIL, KJUR, hextob64) needed to sign QZ Tray print requests with a digital certificate, allowing trusted connections without repeated permission prompts.
