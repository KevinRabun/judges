# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | ✅         |
| < 1.2   | ❌         |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, please report vulnerabilities privately using one of these methods:

1. **GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/KevinRabun/judges/security/advisories/new)
2. **Email**: Create a private security advisory on the repository

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix timeline**: Depends on severity — critical issues are prioritized

### Scope

This project is an MCP server that evaluates code. Security concerns include:

- Prompt injection in judge system prompts
- Information disclosure through evaluation results
- Supply chain vulnerabilities in dependencies
- Unauthorized access patterns in MCP transport

### Out of Scope

- Vulnerabilities in the code *being evaluated* (that's what the judges are for)
- Issues in upstream dependencies — please report those to the respective maintainers
