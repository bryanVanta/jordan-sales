# OpenClaw SSH Integration Setup

## Architecture: Two Gateway URLs

**This integration uses two separate gateway URLs:**

1. **`OPENCLAW_JORDAN_GATEWAY_BASE_URL=ws://localhost:18789`** (Mac-side)
   - Used for future local modes (direct websocket, SSH tunnel fallback)
   - Assumes an SSH tunnel: `ssh -L 18789:192.168.100.199:18789 jeff@192.168.100.199`
   - Not used in current SSH-CLI mode

2. **`OPENCLAW_JORDAN_REMOTE_GATEWAY_URL=ws://192.168.100.199:18789`** (Ubuntu-side, current mode)
   - Used by the **remote OpenClaw CLI** running on Ubuntu via SSH
   - Direct connection to the actual gateway IP
   - Remote command executes ON Ubuntu, so connects directly to `192.168.100.199:18789`
   - This is the actual gateway, not a tunnel endpoint

**Current flow:** Mac backend → SSH to Ubuntu → Remote `openclaw` CLI → Direct to gateway IP

---

## Summary of Changes

### What was fixed
The previous implementation tried to pass a large JSON payload directly via the SSH command line, which caused shell escaping failures:
```bash
# ❌ BROKEN: JSON gets interpreted by shell
ssh user@host "openclaw ... --params '{huge json with quotes, pipes, newlines}'"
```

This failed because special characters like quotes, pipes (`Email|Phone|Whatsapp`), and backslashes were interpreted as shell commands.

### Solution Implemented
Refactored to use **Node.js `spawn()` with stdin piping**, which bypasses the shell entirely:

```javascript
const sshProcess = spawn('ssh', ['jeff@192.168.100.199', remoteCommand]);
sshProcess.stdin.write(paramsJson);  // Send JSON via stdin, not shell args
sshProcess.stdin.end();
```

**Why this works:**
- `spawn()` passes command and arguments as **separate arrays**, not a single string
- JSON is sent via stdin **after** SSH connection is established
- No shell interpretation of the JSON payload
- Handles quotes, pipes, newlines, backslashes safely

### Command Construction

**On Mac (Node.js):**
1. Spawn SSH to Ubuntu with the remote command
2. Write params JSON to stdin

**On Ubuntu (shell, executed via SSH):**
```bash
PARAMS="$(cat)"; \
OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 \
  /home/jeff/.npm-global/bin/openclaw \
  gateway call agent \
  --json --expect-final \
  --url ws://192.168.100.199:18789 \
  --params "$PARAMS" \
  --token 8dce59a17aefe72ae9a404d5f62fae51dad435f9e1095a38 \
  --timeout 120000
```

**Critical points:**
- ✅ `--url ws://192.168.100.199:18789` — **Actual gateway IP**, not localhost tunnel
  - Remote command runs ON Ubuntu, so connects directly to the gateway
  - NOT `ws://localhost:18789` (that's only for Mac-side tunnel modes)
- ✅ `PARAMS="$(cat)"` — Reads stdin into a shell variable
- ✅ `--params "$PARAMS"` — Passes JSON as a string (not a file path)
- ✅ Absolute path: `/home/jeff/.npm-global/bin/openclaw` — No reliance on remote PATH
- ✅ Params JSON piped via stdin — Never embedded in command line

### Required .env Configuration

```env
OPENCLAW_JORDAN_GATEWAY_BASE_URL=ws://localhost:18789
OPENCLAW_JORDAN_REMOTE_GATEWAY_URL=ws://192.168.100.199:18789
OPENCLAW_JORDAN_GATEWAY_TOKEN=8dce59a17aefe72ae9a404d5f62fae51dad435f9e1095a38
OPENCLAW_JORDAN_AGENT_ID=main
OPENCLAW_JORDAN_WORKFLOW_ID=jordan-find-leads
OPENCLAW_JORDAN_BOT_NAME=Jordan
OPENCLAW_JORDAN_NAMESPACE=jordan-sales
OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1
```

**Critical distinction:**
- `OPENCLAW_JORDAN_GATEWAY_BASE_URL=ws://localhost:18789` — Used for local modes (tunneling, direct websocket from Mac)
- `OPENCLAW_JORDAN_REMOTE_GATEWAY_URL=ws://192.168.100.199:18789` — Used by the **remote OpenClaw CLI** running on Ubuntu over SSH
  - This is the actual gateway IP/port, NOT a tunnel endpoint
  - The remote command executes on Ubuntu, so it connects directly to the gateway at `192.168.100.199:18789`

**Other vars:**
- `OPENCLAW_JORDAN_GATEWAY_TOKEN` — Token for authentication (used in remote command)
- `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` — Break-glass env var, sent to remote command for private LAN

### SSH Key Setup (Required)

This integration **requires SSH key-based auth** because stdin is reserved for the JSON params payload, not authentication prompts.

**Step 1: Set up SSH key on Mac**

If you don't have an SSH key, generate one:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
```

**Step 2: Copy public key to Ubuntu**

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub jeff@192.168.100.199
```

(You'll be prompted for your Ubuntu password once to authorize the key)

**Step 3: Verify key-based auth works**

```bash
ssh -o BatchMode=yes jeff@192.168.100.199 'echo ok'
```

If this succeeds silently with no output, key-based auth is working.
If it fails, you'll see an error immediately (no password prompt).

---

### Setup & Testing

**Architecture Overview:**
- **Mac (client)**: Spawns SSH with `-o BatchMode=yes` (non-interactive, key-based auth only)
- **Ubuntu (server)**: Hosts OpenClaw gateway at `192.168.100.199:18789`
- **SSH command path**: Mac backend → SSH (key-based) → Remote openclaw CLI → Direct to gateway IP
- **Stdin usage**: Reserved for JSON params, never for authentication

**Step 1: Verify .env has both URLs**
```env
OPENCLAW_JORDAN_GATEWAY_BASE_URL=ws://localhost:18789
OPENCLAW_JORDAN_REMOTE_GATEWAY_URL=ws://192.168.100.199:18789
```

**Step 2: Verify SSH key auth**
```bash
ssh -o BatchMode=yes jeff@192.168.100.199 'echo ok'
```
(Should return silently without password prompt)

**Step 3: Restart backend**
```bash
npm run dev
```

**Step 4: Test "Find Leads" from frontend**

Expected logs on backend:
```
[OpenClaw] Spawning SSH process to Ubuntu...
[OpenClaw] Sending params to stdin...
[OpenClaw] Response received, parsing...
[OpenClaw] ✓ Found 3 leads
```

**If auth fails**, you'll see:
```
[OpenClaw] ❌ SSH key-based auth is required for OpenClaw stdin piping
[OpenClaw] Setup SSH key with: ssh-copy-id jeff@192.168.100.199
[OpenClaw] Test with: ssh -o BatchMode=yes jeff@192.168.100.199 "echo ok"
```

### What Happens Under the Hood

1. **Frontend** clicks "Find Leads" → POST to `/api/scraping/find-leads`
2. **Backend** constructs params JSON (product info + target customer)
3. **Backend reads `OPENCLAW_JORDAN_REMOTE_GATEWAY_URL`** = `ws://192.168.100.199:18789`
4. **Backend spawns SSH** to `jeff@192.168.100.199` with the remote openclaw command
5. **SSH sends params JSON via stdin** (no shell interpretation, safe quoting)
6. **Ubuntu remote shell** reads stdin: `PARAMS="$(cat)"`
7. **Ubuntu openclaw CLI** executes with `--url ws://192.168.100.199:18789 --params "$PARAMS"`
   - Note: Uses the actual gateway IP, **not** localhost tunnel
8. **Gateway** (on Ubuntu) performs device-auth and finds leads using the agent
9. **Response JSON** comes back through stdout over SSH
10. **Backend** parses it and returns up to 3 leads to frontend
11. **Frontend** displays leads in the table

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| **Request hangs, no response** | SSH prompts for password, consuming stdin | SSH key auth is required. Run `ssh-copy-id jeff@192.168.100.199` |
| `[OpenClaw] ❌ SSH key-based auth is required` | SSH key not set up or not authorized | Run `ssh-copy-id -i ~/.ssh/id_ed25519.pub jeff@192.168.100.199` then test `ssh -o BatchMode=yes jeff@192.168.100.199 'echo ok'` |
| `ssh-copy-id: command not found` | Older macOS/OpenSSH | Install via Homebrew: `brew install openssh` |
| `[OpenClaw] Remote command failed with exit code: 127` | openclaw binary not found on Ubuntu | Verify `/home/jeff/.npm-global/bin/openclaw` exists on Ubuntu |
| `[OpenClaw] Remote command failed ... gateway connect failed` | Wrong gateway URL in remote command | Ensure `.env` has `OPENCLAW_JORDAN_REMOTE_GATEWAY_URL=ws://192.168.100.199:18789` (NOT localhost) |
| `[OpenClaw] No output received` | Remote command timed out or failed silently | Verify SSH key works: `ssh -o BatchMode=yes jeff@192.168.100.199 'echo ok'` |
| `[OpenClaw] Failed to parse JSON response` | Invalid JSON returned | Check Ubuntu OpenClaw gateway logs for device-auth or other errors |
| `Cannot connect to gateway` (from Ubuntu side) | Gateway bound to wrong address | Verify Ubuntu gateway is listening on `192.168.100.199:18789`, not just loopback |

### Why SSH BatchMode=yes is Critical

Without `-o BatchMode=yes`:
- SSH would prompt for a password on stdin
- The Node.js process waits for the prompt to complete
- `sshProcess.stdin` never gets to send the JSON params
- The remote `PARAMS="$(cat)"` hangs waiting for input
- Everything deadlocks

With `-o BatchMode=yes`:
- SSH fails immediately if key auth fails (no password prompt)
- stdin is reserved entirely for the JSON params
- Remote `PARAMS="$(cat)"` receives the JSON successfully
- Clean, non-interactive, deterministic flow

---

### Files Modified

- `backend/server/services/openClawService.js`
  - Changed: SSH spawn to use `-o BatchMode=yes` for non-interactive auth
  - Added: Auth failure detection with helpful error messages
  - No changes to: HTTP fallback, lead normalization, Firebase upsert

### Why Not Other Approaches?

| Approach | Why Not |
|----------|---------|
| Base64 encode JSON | Still shell-bound; `echo` and `base64 -d` add complexity |
| Temp file | Requires remote file cleanup, less portable |
| Direct WebSocket | Requires device-auth implementation (complex, undocumented) |
| SSH tunnel + localhost | ✅ Current approach: simple, robust, leverages existing tunnel |

---

**Status:** Ready to test. Keep SSH tunnel open and restart backend.
