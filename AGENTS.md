# AGENTS.md - Universal System-Wide Operational & Safety Playbook

## 0. WORKING DIRECTORY & SYSTEM AWARENESS
- **Source of Truth:** Restrict all operations strictly to the current project root.
- **No Independent Changes:** **No change is an independent change.** Every edit, addition, or refactor must be planned as an integral part of the broader system. You must analyze and account for every upstream and downstream component that touches the target functionality.

---

## 1. HARD SAFETY & NETWORK BOUNDARIES (NO EXCEPTIONS)
1. **NO NETWORK SCANNING OR RECONNAISSANCE:**
   - NEVER execute network scanning tools (`nmap`, `masscan`, `zmap`, `ping` sweeps, `arp-scan`).
   - NEVER loop across IP subnets, CIDR blocks, or external port ranges.
   - NEVER attempt to discover external hosts or active ports outside `localhost` / `127.0.0.1`.
2. **NO UNAUTHORIZED OUTBOUND CONNECTIONS:**
   - NEVER make curl/wget/http requests to external third-party IP addresses or unknown domains.
   - All network calls must be strictly limited to explicitly defined local development services (`localhost:<port>`).
3. **COMMAND & SCRIPT SAFETY:**
   - Before running any generated script, verify it contains NO web scrapers, crawlers, raw socket scanners, or multithreaded network loops.
   - Do not use tools like `nc` (netcat), `socat`, or raw socket scripts targeting non-local destinations.
4. **NO SECRETS IN CODE:**
   - Never hardcode API keys, passwords, or tokens. Never print environment values.

---

## 2. CODE QUALITY & PRE-CHECK AUDITS (NO WARNINGS OR VULNERABILITIES)
1. **System Mindset & Zero Assumptions:** Treat the codebase as a complex live production system. Never make assumptions about implicit states, side effects, or shared contracts. If any part of the impact is unclear, **STOP and ask**.
2. **Never Break Working Functionality:** You are strictly forbidden from altering or destroying existing working behavior. Passing new tests does not excuse breaking old features.
3. **Impact Assessment Required:** Before executing any change, explicitly state your assessment of how the change integrates with the system, what dependencies it touches, and what failure modes could occur.
4. **Zero Tolerance for Type Warnings (Pylance/TypeScript):** 
   - All Python code must be fully typed (strict type hints, explicit return types) and pass Pylance/Mypy checks with **zero warnings** (no `unknown` data types, partial unknowns, or un-typed parameters).
   - All TypeScript/Node code must compile with strict mode enabled and zero type suppression.
5. **Dependency & Deprecation Audit (Mandatory Reporting):**
   - **Before incorporating any new Node.js or Python module/package**, you must audit it. 
   - If a package is **deprecated**, uses abandoned/unmaintained libraries, or carries **high/critical severity vulnerabilities**, you are strictly barred from using it. 
   - You must report these findings to the user immediately and propose secure, actively maintained alternatives before proceeding.
6. **No Shortcuts or Quality Subversion:** 
   - Never use `# type: ignore`, `ts-ignore`, `eslint-disable`, empty `catch` blocks, or disabled tests to bypass errors.

---

## 3. MANDATORY TESTING SUITE (CI-GATED)
Testing is non-negotiable. No code addition is complete without writing, running, and passing tests across the relevant layers:
1. **Unit Tests:** Write and run isolated unit tests for both Node/Express and Python components.
2. **Modular & Behavioral Tests:** Verify that individual modules interact correctly according to system specifications.
3. **System-Wide Integration Tests:** Test end-to-end flows involving the modified components to ensure zero regressions.
4. **Execution Verification:** You must run the test suites locally after every code addition and **paste the command output** as proof. Never claim a task is "done" or "fixed" without actual execution evidence.

---

## 4. WHEN TO STOP, ASSESS, AND ASK
Stop immediately and present a clear impact assessment to the user before proceeding if:
- A proposed change affects shared contracts, database schemas, public APIs, or core architecture.
- An intended dependency is deprecated, unmaintained, or has high/critical security vulnerabilities.
- You are unsure whether an edit will break existing working functionality or introduce type warnings.
- Requirements are ambiguous or conflict with current system boundaries.
- You encounter an existing broken baseline that must be touched to achieve the task.

## 5. DEPENDENCY & VULNERABILITY GOVERNANCE (INDUSTRY STANDARD)
1. **New Dependencies Require Explicit Audit:**
   - Before adding any new package (npm/pip), run automated checks (`npm audit`, `pip-audit`). 
   - **Zero Tolerance:** No package with known **High or Critical** severity vulnerabilities, or packages flagged as deprecated/abandoned, may be introduced. If a needed package has vulnerabilities, you must stop, report it, and propose a secure alternative.
2. **Blast Radius / Scope Containment (No Legacy Ghost-Chasing):**
   - **Do not** attempt to fix pre-existing vulnerabilities or outdated modules in legacy parts of the codebase that are unrelated to your current task. 
   - If you touch a file that imports a vulnerable or deprecated module, you must **at minimum report it** in your change summary, but do not refactor the entire dependency tree unless explicitly assigned that refactoring task.
3. **Automated Gate Enforcement:**
   - Dependency checks, type checking (`mypy` / `tsc`), and test suites must pass clean in CI before any code change is considered ready.

6. **Runtime Configuration Validation:**
   - All environment variables (e.g., ports, database URLs, secret keys) must be validated at application startup (using schemas like Zod or Pydantic). 
   - If a required configuration is missing or malformed, the application must immediately crash-fast with a clear error log rather than failing silently mid-execution.

7. **STANDARDIZED API & ERROR CONTRACTS:**
    1. **Uniform Response Structure:** 
        - All API endpoints must adhere to a consistent response schema:
        - Success: `{ success: true, data: ... }` or `{ success: true, message: "...", data: ... }`
        - Failure: `{ success: false, message: "..." }` (optionally accompanied by structured error codes).
    2. **Global Error Handling:**
        - Never leave unhandled promise rejections or uncaught exceptions. All errors must flow through centralized Express error-handling middleware to prevent server crashes and information leakage.

8. **Destructive Operation Safeguards:**
   - Never execute destructive database queries (e.g., `DROP TABLE`, unconstrained `DELETE FROM`, full database resets) in migration scripts or service files without explicit guards, transaction rollbacks, or confirmation checks.

9. **VERSION CONTROL & COMMIT HYGIENE**
    1. **Atomic Commits:** Make small, logical, single-purpose commits. Do not bundle unrelated refactors into a feature commit.
    2. **Clean Working Tree:** Ensure your working directory is clean and free of leftover debugging code, console logs, or temporary files before marking any task as complete.

10. **SERVERLESS & INFRASTRUCTURE ENGINEERING (AWS / TERRAFORM)**
    1. **Infrastructure as Code (IaC) First:**
    - Never provision manual resources in the AWS Console. Everything (S3 buckets, Lambda functions, IAM roles, API gateways, EventBridge rules) must be defined and deployed via Terraform.
    2. **Least Privilege IAM Policies:**
    - IAM roles assigned to Lambda functions and execution blocks must follow strict least-privilege principles. Wildcard permissions (`"Resource": "*"`) are strictly forbidden unless accessing public read buckets (like CloudFront distribution domains).
    3. **Local Simulation & Mocking:**
    - Test Lambda handlers and event triggers locally where possible (using tools like local payload payloads or unit tests) before pushing infrastructure changes to AWS.
    4. **Media Processing Constraints:**
    - Ensure all media handling code properly accounts for asynchronous event-driven lifecycles (e.g., handling MediaConvert webhook notifications or S3 trigger completion states rather than blocking synchronous HTTP requests).


## 💰 Cost Management & AWS Free Tier Guardrails

Because this project utilizes AWS infrastructure (such as AWS Elemental MediaConvert), follow these strict operational rules to keep development costs at **€0.00 - €5.00 max**:

### 1. Optimize Media Encoding Profiles
* **Rule:** When configuring MediaConvert jobs (via Terraform or console overrides), strictly use standard single-pass H.264/AAC output profiles capped at 720p or 1080p for local testing.
* **Prohibited:** Never use multi-pass 4K encoding or high-tier cinematic profiles during development iterations to avoid rapid credit depletion.

### 2. Teardown Resources After Sessions
* **Rule:** Always tear down temporary infrastructure when active coding or testing sessions conclude. 
* **Action:** Run the following command to completely wipe out active resources and prevent lingering billing states:
  ```bash
  terraform destroy