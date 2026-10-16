# Prime workflow diagram

How a goal moves through Prime v0.6 on autopilot, from plan to a verified local base, and how each step maps to an SDLC phase ([ไทย](#sdlc-th)). Step by step: [QUICKSTART.en.md](QUICKSTART.en.md) · [QUICKSTART.md](QUICKSTART.md) (ไทย). Roles and design: [prime-architecture.md](prime-architecture.md).

```
                        ┌──────────────────────────────────────────┐
  you ── goal in ─────▶ │  Prime hub: prime-workflow skill (starts on  │   setup unknown? → /prime-doctor
         plain words    │  its own) or prime-orchestrator main agent │   (every problem has a fix: hint)
                        └────────────────────┬─────────────────────┘
                                             ▼
            ┌─────▶  tick: node scripts/prime-run.mjs --apply --json   (the harness)
            │          reads plan · worktrees · state · ledger, runs every mechanical step,
            │          returns the agent actions
            │                                ▼
            │        hub dispatches them (all agent actions of one tick in parallel)
            └──────  tick again, until done or stop

 ① PLAN      hub writes .prime/plan.json (streams · owned paths · dependsOn · acceptance commands)
             check ─▶ approve-plan: prime-reviewer says PLAN: APPROVE ─▶ accept --by reviewer
                      (automation.planApproval "user": ⏸ waits for your OK)
             accept names the run's integration branch prime/<title>-<hash6>; harness creates it from the target
            (e.g. main), then the worktrees in dependency order (port, .env.worktree, ownership.json)
                                      ▼
 ② BUILD     ┌ worktree A ┐   ┌ worktree B ┐   ┌ worktree C ┐   build / fix, commit when done
             │ claude-code│   │   codex    │   │   hermes   │   each builder = a herdr teammate (prime-team.sh)
             └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   (codex/hermes missing → claude-code)
                   └────────────────┼────────────────┘          maxTurns per agent (prime.config.json)
             each run logged by prime-team.sh: agent <role> <name> ok|partial|failed
                                      ▼
 ③ CHECK     harness: the stream's acceptance checks, path ownership (files outside the stream's paths)
             and the secret scan, then prime-gate.sh (lint/typecheck/test; none found → .prime/gate.sh
             from the acceptance commands)                               fail ─▶ fix, back to ②
                                      ▼
 ④ REVIEW    prime-reviewer + Codex second opinion (prime-codex.sh review)
                 ├─ APPROVE ─────────────────────────────┐
                 ├─ REQUEST_CHANGES ─▶ fix, back to ②    │
                 └─ BLOCK ─▶ stop: needs you             │
                                      ▼  ◀───────────────┘
 ⑤ MERGE     harness: prime-merge.sh --apply into the INTEGRATION branch, one stream at a time, plan order
             (automation.merge "ask": ⏸ asks you first)        never pushes, never force-pushes
             conflict (exit 4) ─▶ resolve by codex ─▶ checks, gate and review again (③)
                                      ▼
 ⑥ VERIFY    harness: clean up the stream worktrees, open a final worktree on the integration branch
             ─▶ verify = every acceptance check + gate + paths check (union of all streams' paths)
             fail ─▶ replan: hub adds a fix stream (new slug, merged streams stay in the plan) ─▶ ①
                                      ▼
 ⑦ FINAL     prime-reviewer + Codex second opinion on the WHOLE target...integration diff (final-review,
   REVIEW    base = target)   target moved ─▶ resolve by codex: git merge target, never rebase ─▶ ⑥
                 ├─ APPROVE ─▶ ONE merge into the LOCAL target (--no-rebase), main untouched until now
                 ├─ REQUEST_CHANGES ─▶ replan: fix stream ─▶ ①
                 └─ BLOCK ─▶ stop: needs you
             then clean up the final worktree ─▶ done: final report (/prime-report turns vs budget)

 stop  a stream after 3 failed checks or reviews (hardStopOnRepeatedFailures), or a step that makes
       no progress: Prime reports why and keeps driving the other streams
```

**Manual controls:** the `/prime-*` commands still run one step at a time (`/prime-plan`, `/prime-review`, `/prime-merge`, `/prime-status`, `/prime-queue`, `/prime-report`, `/prime-cleanup`). `prime-run.mjs` without `--apply` previews the next actions and changes nothing; `prime-run.mjs verify` checks the base now.

**Exit codes (every script):** 0 ok · 1 check failed · 2 usage · 3 refused by policy (incl. secret-scan) · 4 conflict or base moved with `--no-rebase` → codex · 5 stale review. Details: [exit-codes.md](exit-codes.md).

**MCP routing:** research → Perplexity, used by the hub only (fallback WebSearch + WebFetch) · library/API docs → Context7 (fallback WebFetch of official docs). Both are optional.

## SDLC phases

Prime runs a change through the software development life cycle. Each phase ends with an exit criterion, and the next phase starts only when it holds. The harness checks the criteria; nobody has to type a command between phases.

```
 requirements ──▶ design ──▶ build ──▶ test & review ──▶ release ──▶ maintain
  hub              ①          ②          ③ ④               ⑤           ⑥
                   ▲          ▲          │                 │           │
                   │          ├──────────┘ fix             │           │
                   │          └────────────────────────────┘ resolve   │
                   └───────────────────────────────────────────────────┘ replan

 fix: failed check or REQUEST_CHANGES · resolve: merge conflict, by codex · replan: failed verify or wrong scope
```

| Phase | Prime step | Exit criterion |
|---|---|---|
| Requirements | The hub turns your request into a goal, non-goals and success criteria; it asks you only when a wrong guess would waste the run | Written into the plan; every stream gets runnable acceptance checks |
| Design | ① The hub writes `.prime/plan.json`: streams, owned paths, dependsOn, risks; an ADR in `docs/decisions/` for lasting decisions | `check` passes and `prime-reviewer` approves (`accept --by reviewer`); you approve instead when `automation.planApproval` is `user` |
| Build | ② One worktree per stream: `claude-code` for focused work, `codex` (the Codex CLI) for multi-file integration, `hermes` (Hermes Agent) for self-contained streams; each commits its work | The harness ran the stream's acceptance checks on its HEAD and they pass; the run is in the ledger |
| Test and review | ③ The harness runs `prime-gate.sh` (lint/typecheck/test); ④ an independent `prime-reviewer` with a Codex second opinion | Gate passes and APPROVE on the current patch |
| Release | ⑤ The harness merges each stream into the integration branch in plan order (`automation.merge: "ask"` asks you first; a conflict goes to `codex` as `resolve`); ⑦ after `verify` and an APPROVE from `final-review` of the whole diff, one merge into the local target | Merged without force-push, the target untouched until the final APPROVE, and nothing pushed. Pushing, PRs and deploying stay your call, with the owner's approval |
| Maintain | ⑥ The harness cleans up and runs `verify` (acceptance, gate, paths) on the integration branch, and the merged worktrees are removed after ⑦; final report (`/prime-report`), ADR updates | Merged worktrees removed, verify passes, budget use and failures reported |

**Principles**

- **Test early:** acceptance checks are runnable commands written in the plan, before any code.
- **Traceability:** every merge traces back through goal, stream, acceptance, gate, verdict and ledger.
- **Change control:** a changed plan must be approved again before worktrees are created; any new commit resets the checks, the gate and the review (a stale review is exit 5).
- **Separation of duties:** nobody approves their own plan or code: the reviewer approves the hub's plan and the builders' code.
- **Fail back to the owning phase:** a failed check or REQUEST_CHANGES goes back to build (`fix`), a conflict to `codex` (`resolve`) and then checks and review again, a failed verify, a final REQUEST_CHANGES or wrong scope to a re-plan that adds a fix stream under a new slug.
- **Small batches:** one stream per worktree, merged one branch at a time in plan order.
- **Review the whole:** streams are reviewed one by one, then the combined diff is reviewed once more against the target before it lands.
- **Fail closed on secrets and scope:** the secret scan and path ownership run on every stream and on the final diff.
- **Bounded retries:** a stream stops after 3 failed checks or reviews (`hardStopOnRepeatedFailures`), and a step that makes no progress stops too; Prime reports why instead of looping.

<a id="sdlc-th"></a>
## หลักการ SDLC (ภาษาไทย)

Prime พางานผ่านวงจรการพัฒนาซอฟต์แวร์ (SDLC) ทีละเฟส แต่ละเฟสมีเกณฑ์ผ่าน ถ้ายังไม่ผ่านจะไม่เริ่มเฟสถัดไป ตั้งแต่ v0.5 harness เป็นผู้ตรวจเกณฑ์เหล่านี้เอง คุณไม่ต้องพิมพ์คำสั่งระหว่างเฟส

| เฟส | ขั้นใน Prime | เกณฑ์ผ่าน |
|---|---|---|
| เก็บความต้องการ | hub แปลงคำขอเป็นเป้าหมาย สิ่งที่ไม่ทำ และเกณฑ์ความสำเร็จ จะถามคุณก็ต่อเมื่อเดาผิดแล้วเสียทั้งรอบ | เขียนลงแผนแล้ว และทุก stream มี acceptance check ที่รันได้จริง |
| ออกแบบ | ① hub เขียน `.prime/plan.json`: stream, ไฟล์ที่แต่ละ stream ดูแล, dependsOn, ความเสี่ยง และเขียน ADR ใน `docs/decisions/` สำหรับการตัดสินใจระยะยาว | `check` ผ่าน และ `prime-reviewer` อนุมัติ (`accept --by reviewer`) ถ้าตั้ง `automation.planApproval` เป็น `user` คุณจะเป็นผู้อนุมัติแทน |
| พัฒนา | ② หนึ่ง worktree ต่อหนึ่ง stream: `claude-code` สำหรับงานเฉพาะจุด, `codex` (Codex CLI) สำหรับงานรวมหลายไฟล์, `hermes` (Hermes Agent) สำหรับ stream ที่ทำจบในตัว แต่ละตัว commit งานของตัวเอง | harness รัน acceptance check ของ stream บน HEAD นั้นแล้วผ่าน และบันทึกการรันลง ledger แล้ว |
| ทดสอบและรีวิว | ③ harness รัน `prime-gate.sh` (lint/typecheck/test); ④ `prime-reviewer` ที่ไม่ได้เขียนโค้ดเองเป็นผู้ตรวจ โดยขอความเห็นที่สองจาก Codex | gate ผ่าน และได้ APPROVE บน patch ปัจจุบัน |
| ส่งมอบ | ⑤ harness merge แต่ละ stream เข้า integration branch (`prime/<ชื่อ>-<hash6>`) ตามลำดับในแผน (ตั้ง `automation.merge: "ask"` ถ้าอยากให้ถามก่อน) ถ้าชนกันจะส่งให้ `codex` ทำ `resolve` จากนั้น ⑦ `prime-reviewer` รีวิว diff ทั้งก้อน (`final-review`) ถ้า APPROVE จึง merge เข้า base ในเครื่องครั้งเดียว | merge แล้วโดยไม่ force-push base ไม่ถูกแตะจนกว่าจะ APPROVE ขั้นสุดท้าย และไม่ push อะไรขึ้นไป การ push, เปิด PR และ deploy เป็นการตัดสินใจของคุณ และต้องได้รับอนุมัติจากเจ้าของ |
| ดูแลต่อ | ⑥ harness เก็บกวาด worktree แล้วรัน `verify` (acceptance, gate, ตรวจ path) บน integration branch, สรุปผลด้วย `/prime-report`, อัปเดต ADR | ลบ worktree ที่ merge แล้ว, verify ผ่าน และรายงานการใช้งบกับจุดที่ล้มเหลว |

**หลักการ**

- **ทดสอบตั้งแต่ต้น:** เขียน acceptance check เป็นคำสั่งที่รันได้ไว้ในแผน ก่อนเริ่มเขียนโค้ด
- **ตรวจย้อนได้:** ทุก merge ย้อนกลับไปหาเป้าหมาย, stream, acceptance, gate, คำตัดสินรีวิว และ ledger ได้
- **ควบคุมการเปลี่ยนแปลง:** แผนที่ถูกแก้ต้องได้รับอนุมัติใหม่ก่อนสร้าง worktree และ commit ใหม่ทุกครั้งทำให้ต้องรัน check, gate และรีวิวใหม่ทั้งหมด (รีวิวที่หมดอายุคือ exit 5)
- **แยกหน้าที่:** ไม่มีใครอนุมัติแผนหรือโค้ดของตัวเอง reviewer เป็นผู้อนุมัติทั้งแผนของ hub และโค้ดของผู้เขียน
- **ย้อนกลับไปเฟสที่รับผิดชอบปัญหา:** check ไม่ผ่านหรือได้ REQUEST_CHANGES กลับไปเฟสพัฒนา (`fix`), conflict ส่งให้ `codex` (`resolve`) แล้วตรวจและรีวิวใหม่, verify ไม่ผ่าน ผู้รีวิวขั้นสุดท้ายขอแก้ หรือขอบเขตผิด ก็วางแผนใหม่โดยเพิ่ม fix stream ใต้ slug ใหม่
- **ทำงานเป็นชิ้นเล็ก:** หนึ่ง stream ต่อหนึ่ง worktree และ merge ทีละสาขาตามลำดับในแผน
- **ลองซ้ำอย่างมีขีดจำกัด:** stream ที่ check หรือรีวิวไม่ผ่านครบ 3 ครั้ง (`hardStopOnRepeatedFailures`) จะหยุด ขั้นที่ไม่คืบหน้าก็หยุดเช่นกัน แล้ว Prime รายงานสาเหตุแทนที่จะวนซ้ำไปเรื่อย ๆ
