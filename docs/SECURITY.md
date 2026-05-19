# Security

Security priorities:

- least-privilege IPC surface
- no direct renderer access to Node or raw filesystem APIs
- validate external data at the boundary
- treat downloaded mod archives as untrusted input
- keep secrets out of the repository

Specific risks:

- path traversal during archive extraction
- writing outside the intended game or app-managed directories
- UI-triggered privileged actions without confirmation
- assuming GameBanana payload fields are stable without validation
