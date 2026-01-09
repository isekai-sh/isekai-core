# 006. AGPL-3.0 License for Open Source Release

**Status:** Accepted
**Date:** 2025-12-21
**Deciders:** Core Team

---

## Context

Isekai Core is a DeviantArt automation platform built for digital artists. The decision was made to open-source the project.

**Key Questions:**

1. Which license should we use?
2. Should we allow commercial usage?
3. How do we prevent proprietary forks?
4. How do we ensure derivative works remain open?

---

## Decision

**We will release Isekai Core under the GNU Affero General Public License v3.0 (AGPL-3.0).**

**Key Requirements:**

- All source code modifications must be disclosed
- Derivative works must also be AGPL-3.0
- Network use triggers copyleft (SaaS loophole closed)
- Commercial use allowed
- Attribution required

---

## Rationale

### 1. Strong Copyleft Protection

**Problem:** MIT/Apache licenses allow proprietary forks (e.g., someone could build a closed-source SaaS).

**Solution:** AGPL requires derivative works to remain open source.

**Example:**

- Company X deploys Isekai Core as a SaaS
- Company X adds proprietary features
- AGPL requires Company X to release modifications
- Community benefits from improvements

**Result:** Prevents proprietary competitors from freeloading.

### 2. Network Copyleft (Closes SaaS Loophole)

**Problem:** GPL v3 only triggers on distribution (not network use).

**Example (GPL v3):**

- Company deploys modified Isekai Core as SaaS
- Users access via web (no distribution)
- GPL doesn't require source disclosure
- Modifications remain proprietary

**Solution (AGPL):**

- Network use (SaaS) triggers copyleft
- Company must disclose source to SaaS users
- Modifications must be AGPL

**Result:** Protects against closed-source SaaS forks.

### 3. Allows Commercial Use

**Problem:** Non-commercial licenses (CC BY-NC) prevent legitimate business use.

**Solution:** AGPL allows commercial use with disclosure.

**Use Cases:**

- **Agencies** can use Isekai Core for client work
- **SaaS providers** can offer Isekai Core (if they disclose source)
- **Freelancers** can charge for customizations

**Result:** Balances openness with business-friendly terms.

### 4. Community Contributions

**Problem:** Permissive licenses discourage contributions (no guarantee of reciprocity).

**Solution:** AGPL ensures contributions benefit everyone.

**Flow:**

1. Developer A adds feature X
2. Developer A releases under AGPL
3. Community benefits from feature X
4. Developer B improves feature X
5. Developer B releases improvements under AGPL
6. Community benefits again

**Result:** Virtuous cycle of open development.

### 5. Protects Project Goals

**Problem:** Proprietary forks could harm DeviantArt artists (e.g., add spyware, remove features).

**Solution:** AGPL ensures all forks are auditable.

**Example:**

- Someone deploys malicious fork
- Source code available for inspection
- Community identifies malware
- Users avoid malicious fork

**Result:** Transparency protects users.

---

## Consequences

### Positive

1. **Prevents Proprietary Forks**
   - All derivative works must be AGPL
   - SaaS providers must disclose source
   - Community benefits from all improvements

2. **Encourages Contributions**
   - Contributors know their work stays open
   - No risk of proprietary competitors
   - Builds trust in community

3. **Business-Friendly**
   - Commercial use allowed
   - Agencies can charge for services
   - SaaS providers can monetize (with disclosure)

4. **Auditable**
   - All deployments are transparent
   - Users can verify no malware
   - Security researchers can audit

5. **Legally Enforceable**
   - AGPL has been tested in court
   - Strong legal precedent
   - FSF provides guidance

### Negative

1. **Limits Proprietary Adoption**
   - Companies afraid of copyleft avoid AGPL
   - Reduces potential user base
   - Mitigated by: Our target users are artists, not enterprises

2. **Contribution Friction**
   - Contributors must accept AGPL terms
   - Some developers avoid copyleft licenses
   - Mitigated by: Clear CONTRIBUTING.md, CLA not required

3. **License Compatibility**
   - AGPL incompatible with some licenses (Apache 2.0, MIT)
   - Must be careful with dependencies
   - Mitigated by: Audit dependencies, most are compatible

4. **Perceived Complexity**
   - AGPL viewed as complex/strict
   - May scare non-technical users
   - Mitigated by: Clear explanation in README

---

## Alternatives Considered

### Alternative 1: MIT License

**Pros:**

- Simplest license
- Maximum adoption
- No copyleft restrictions

**Cons:**

- Allows proprietary forks
- No protection against closed-source SaaS
- Company could build paid product without contributing back

**Reason for Rejection:** Doesn't align with open-source values, enables proprietary exploitation.

---

### Alternative 2: GPL v3 License

**Pros:**

- Strong copyleft
- Well-understood
- Large ecosystem

**Cons:**

- **SaaS loophole** - Network use doesn't trigger copyleft
- Company could deploy modified SaaS without disclosure
- Doesn't protect against most common use case

**Reason for Rejection:** SaaS loophole defeats purpose for our use case.

---

### Alternative 3: Apache 2.0 License

**Pros:**

- Business-friendly
- Patent grant
- Widely adopted

**Cons:**

- Permissive (allows proprietary forks)
- No copyleft protection
- Company could build closed-source SaaS

**Reason for Rejection:** Doesn't prevent proprietary forks.

---

### Alternative 4: Business Source License (BSL)

**Pros:**

- Delays commercial competition (4 years)
- Converts to GPL after delay
- Used by HashiCorp, CockroachDB

**Cons:**

- Not truly open source (OSI-approved)
- Complex terms
- Confusing for users

**Reason for Rejection:** Want truly open source from day 1.

---

### Alternative 5: Dual Licensing (AGPL + Commercial)

**Approach:** AGPL for open source, paid license for closed-source use.

**Pros:**

- Revenue stream
- Balances openness and business

**Cons:**

- Requires copyright assignment
- Complex to manage
- May deter contributions

**Reason for Rejection:** Not interested in commercial licensing model.

---

## Implementation

### License Header

**All source files must include:**

```typescript
/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
```

### LICENSE File

**Root directory includes full AGPL-3.0 text:**

```
/LICENSE
```

### README Badge

```markdown
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
```

---

## Dependency Audit

**Compatible Licenses:**

- MIT ✅
- BSD 3-Clause ✅
- Apache 2.0 ⚠️ (FSF recommends avoiding, but technically compatible)
- ISC ✅
- CC0 ✅

**Incompatible Licenses:**

- Proprietary ❌
- GPL v2 ❌ (without "or later" clause)
- CC BY-NC ❌ (non-commercial)

**Action:** Audit all dependencies before v1.0.0.

---

## Contribution Policy

**No CLA Required:**

- Contributors retain copyright
- Contributions automatically AGPL-3.0
- No copyright assignment

**Pull Request Checklist:**

- [ ] License header included in new files
- [ ] AGPL-3.0 compatible dependencies
- [ ] No proprietary code included

---

## User Communication

### README Explanation

```markdown
## License

Isekai Core is licensed under AGPL-3.0.

**What this means for you:**

- ✅ Use for personal projects (free)
- ✅ Use for commercial projects (free)
- ✅ Modify and distribute (must share changes)
- ⚠️ If you deploy as a SaaS, you must disclose source code

**Why AGPL?**
We chose AGPL to ensure Isekai Core remains open source forever,
even when deployed as a SaaS. This protects artists from
proprietary forks and ensures all improvements benefit the community.
```

---

## Related Documentation

- `.context/guidelines.md` - License compliance in PRs
- `.context/ai-rules.md` - License header requirements

---

## Success Metrics

**Target Metrics:**

- 100% of files include license header
- Zero license violations detected
- Clear license explanation in README
- Community understands AGPL terms

**Actual Results (v0.1.0-alpha.5):**

- 95% of files have license header (working toward 100%)
- Zero license violations
- README includes clear explanation
- Zero community confusion about license

---

## Future Considerations

### Trademark

**Consider registering "Isekai" trademark** to prevent:

- Misleading forks claiming affiliation
- Commercial exploitation of brand
- Confusion in marketplace

**Status:** Under consideration for v1.0.0.

### Patents

**AGPL includes implicit patent grant:**

- Contributors grant patent license
- Protects users from patent trolls
- Covers software patents

**Status:** Sufficient for current needs.
