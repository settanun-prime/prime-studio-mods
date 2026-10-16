import { expect, test } from 'claude-code/testing'

import { findSensitive, redact, secretCount, setIdentity } from '../hooks/detect'

// every sample is made up
const hit = (t: string) => findSensitive(t).map(([s, e, k]) => `${k}:${t.slice(s, e)}`)
const none = (t: string) => expect(hit(t)).toEqual([])
const BS = '\\'
const profile = (name: string) => ['C:', 'Users', name, 'AppData'].join(BS)

test('the account folder of a profile path is a user name', () => {
  setIdentity({ users: [], hosts: [] })
  expect(hit(profile('alice'))).toEqual(['USERNAME:alice'])
  expect(hit(`"C:${BS}${BS}Users${BS}${BS}dave${BS}${BS}x"`)).toEqual(['USERNAME:dave'])
  expect(hit('/c/Users/bob/proj')).toEqual(['USERNAME:bob'])
  expect(hit('cat /home/carol/.ssh/config')).toEqual(['USERNAME:carol'])
  none(profile('Public'))
  none('C:\\Users\\%USERNAME%\\x and /home/$USER/x')
  none('C:\\Users\\[REDACTED:USERNAME_1~k3x9]\\x')
})

test('MAC address, SID and keys', () => {
  setIdentity({ users: [], hosts: [] })
  expect(hit('mac 02:11:22:33:44:55 ok')).toEqual(['MAC:02:11:22:33:44:55'])
  expect(hit('02-11-22-33-44-AA')).toEqual(['MAC:02-11-22-33-44-AA'])
  none('00:00:00:00:00:00 at 10:20:30 ratio 1:2:3:4:5:6:7')
  expect(hit('S-1-5-21-1111111111-2222222222-3333333333-1001')).toEqual(['SID:S-1-5-21-1111111111-2222222222-3333333333-1001'])

  const pub = ['ssh-ed25519', ' AAAAC3NzaC1lZDI1NTE5AAAAI', 'FAKE'.repeat(10), ' alice@workbox'].join('')
  expect(hit(`key ${pub}`)).toEqual([`KEY:${pub}`])
  const pem = ['-----BEGIN OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXk', 'AAAA', '-----END OPENSSH PRIVATE KEY-----'].join('\n')
  expect(hit(`${pem}\nafter`)).toEqual([`SECRET:${pem}`])
  expect(secretCount(pem)).toBe(1)
  expect(secretCount(pub)).toBe(0) // a public key is hidden, not a reason to refuse the prompt
})

test('ssh config lines, ssh targets, prompts, UNC paths and LAN URLs name machines', () => {
  setIdentity({ users: [], hosts: [] })
  expect(hit('Host box\n  HostName nas.local\n  User eve\n')).toEqual(['HOST:box', 'HOST:nas.local', 'USERNAME:eve'])
  expect(hit('AllowUsers frank')).toEqual(['USERNAME:frank'])
  expect(hit('ssh frank@devbox hostname')).toEqual(['HOST:frank@devbox'])
  expect(hit('scp a.txt frank@devbox:/tmp')).toEqual(['HOST:frank@devbox'])
  expect(hit('frank@devbox MINGW64 ~/proj')).toEqual(['HOST:frank@devbox'])
  expect(hit([BS, BS, 'fileserver', BS, 'share', BS, 'x'].join(''))).toEqual(['HOST:fileserver'])
  expect(hit('open http://nas.local/x and http://devbox:8080/y')).toEqual(['HOST:nas.local', 'HOST:devbox'])
  none('https://github.com/foo/bar http://localhost:3000 https://example.com/x')
})

test('labels: user, computer, serial, git author, IPv6, more token families', () => {
  setIdentity({ users: [], hosts: [] })
  expect(hit('username: grace\nComputer Name: WORKBOX\nSerial Number: ABC123XYZ')).toEqual(['USERNAME:grace', 'HOST:WORKBOX', 'DEVICE:ABC123XYZ'])
  expect(hit('Author: Alice Smith <alice@mail.test>').filter(x => x.startsWith('NAME'))).toEqual(['NAME:Alice Smith'])
  expect(hit('Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>').filter(x => x.startsWith('NAME'))).toEqual([])
  expect(hit('addr fe80::1ff:fe23:4567:890a up')[0]).toMatch(/^IP:fe80::/)
  // an address made to be public is not personal data
  none('123+alice@users.noreply.github.com and noreply@anthropic.com')
  expect(hit('mail alice@mail.test')).toEqual(['EMAIL:alice@mail.test'])
  expect(secretCount(['github_pat_', 'A'.repeat(30)].join(''))).toBe(1)
  expect(secretCount('client_secret: abcdef123456')).toBe(1)
})

test('documentation examples and version numbers are not machines', () => {
  setIdentity({ users: [], hosts: [] })
  // RFC 5737 blocks are for documentation; 0.x.x.x is "this network", and how a four-part version looks
  none('use 192.0.2.50 or 198.51.100.7 or 203.0.113.9')
  none('assemblyIdentity version="0.2.0.0"  OpenSSH.Server~~~~0.0.1.0')
  // a sentence after "login:" is prose; the word SSH in a sentence is not the ssh program
  none('The first contact needs a login: the other machine must allow it.')
  none('Pairing lets machines SSH into each other. Type user@address in the box. Run ssh-lan.sh --target user@address')
  expect(hit('192.168.1.50')).toEqual(['IP:192.168.1.50']) // a real home address still is
})

test('ordinary code is left alone', () => {
  setIdentity({ users: [], hosts: [] })
  for (const code of ['const user = getUser()', 'user: string', 'hostname: string', 'serial: number', 'login: true', 'npm install react@latest', 'import x from "@types/node"', 'const host = os.hostname()', 'uuid = uuid4()', 'User-Agent: curl/8'])
    none(code)
})

test("the machine's own names are hidden as bare words, and only as whole words", () => {
  setIdentity({ users: ['alice'], hosts: ['WORKBOX'] })
  expect(hit('-rw-r--r-- 1 alice 197609 10348 file')).toEqual(['USERNAME:alice'])
  expect(hit('Alice and ALICE')).toEqual(['USERNAME:Alice', 'USERNAME:ALICE'])
  none('annual alicegarden alice-b')
  expect(hit('on WORKBOX now and workbox later')).toEqual(['HOST:WORKBOX'])
  expect(redact(`${profile('alice')} owner alice on WORKBOX`).found).toBe(1 + 1 + 1)
  setIdentity({ users: [], hosts: [] })
})

test('hostile text stays linear', () => {
  setIdentity({ users: [], hosts: [] })
  const ms = (t: string) => {
    const t0 = Date.now()
    findSensitive(t)
    return Date.now() - t0
  }
  for (const text of ['@'.repeat(50_000), 'ssh a@'.repeat(20_000), 'User' + ' '.repeat(100_000) + '\n', '-----BEGIN PRIVATE KEY-----'.repeat(20_000), BS.repeat(100_000), '1:'.repeat(60_000), 'http://' + 'a'.repeat(100_000), 'Host ' + 'a'.repeat(100_000)])
    expect(ms(text)).toBeLessThan(2500)
})
