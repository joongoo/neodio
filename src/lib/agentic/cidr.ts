// IPv4/IPv6 파서와 CIDR 매칭. BigInt 없이(target ES2017) 숫자·바이트 배열로 처리한다.
// 보수적 파서: 모호한 표기(앞자리 0이 붙은 옥텟 등)는 받지 않는다 — 8진수 해석 차이로 인한 오판을 피한다.

export type ParsedIp = { family: 4; value: number } | { family: 6; bytes: Uint8Array };

export interface Prefix {
  family: 4 | 6;
  /** IPv4: 부호 없는 32비트 정수 / IPv6: 16바이트 */
  net: number | Uint8Array;
  length: number;
}

function parseIPv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function parseHexGroups(text: string): number[] | null {
  if (text === "") return [];
  const groups: number[] = [];
  for (const g of text.split(":")) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    groups.push(parseInt(g, 16));
  }
  return groups;
}

function parseIPv6(input: string): Uint8Array | null {
  let text = input.toLowerCase();
  // 끝에 점 표기 IPv4가 붙은 형태(::ffff:1.2.3.4)를 16진 두 그룹으로 바꾼다
  if (text.indexOf(".") >= 0) {
    const cut = text.lastIndexOf(":");
    if (cut < 0) return null;
    const v4 = parseIPv4(text.slice(cut + 1));
    if (v4 === null) return null;
    const hi = Math.floor(v4 / 65536).toString(16);
    const lo = (v4 % 65536).toString(16);
    text = `${text.slice(0, cut + 1)}${hi}:${lo}`;
  }
  const doubleColon = text.indexOf("::");
  let groups: number[];
  if (doubleColon >= 0) {
    if (text.indexOf("::", doubleColon + 1) >= 0) return null; // "::"은 한 번만
    const head = parseHexGroups(text.slice(0, doubleColon));
    const tail = parseHexGroups(text.slice(doubleColon + 2));
    if (!head || !tail || head.length + tail.length > 7) return null;
    const fill = new Array<number>(8 - head.length - tail.length).fill(0);
    groups = head.concat(fill, tail);
  } else {
    const all = parseHexGroups(text);
    if (!all || all.length !== 8) return null;
    groups = all;
  }
  const bytes = new Uint8Array(16);
  groups.forEach((g, i) => {
    bytes[i * 2] = g >> 8;
    bytes[i * 2 + 1] = g & 0xff;
  });
  return bytes;
}

function isV4Mapped(bytes: Uint8Array): boolean {
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return false;
  return bytes[10] === 0xff && bytes[11] === 0xff;
}

function v4FromBytes(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 256 + bytes[offset + 1]) * 256 + bytes[offset + 2]) * 256 + bytes[offset + 3];
}

/**
 * 로그에 기록된 IP 문자열을 해석한다. 대괄호·존 ID(%eth0)·IPv4의 :포트를 걷어내고,
 * IPv4-mapped IPv6(::ffff:a.b.c.d)는 IPv4로 변환한다. 해석할 수 없으면 null.
 */
export function parseIp(input: string): ParsedIp | null {
  let text = input.trim();
  if (text === "") return null;
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  // a.b.c.d:port
  const portMatch = /^([0-9.]+):[0-9]{1,5}$/.exec(text);
  if (portMatch) text = portMatch[1];
  if (text.indexOf(":") >= 0) {
    const bytes = parseIPv6(text);
    if (!bytes) return null;
    if (isV4Mapped(bytes)) return { family: 4, value: v4FromBytes(bytes, 12) };
    return { family: 6, bytes };
  }
  const v4 = parseIPv4(text);
  return v4 === null ? null : { family: 4, value: v4 };
}

/** "a.b.c.d/len" 또는 "ipv6/len". 길이가 없으면 단일 주소(/32, /128)로 본다. 해석 불가면 null. */
export function parsePrefix(text: string): Prefix | null {
  const trimmed = text.trim();
  const slash = trimmed.indexOf("/");
  const addrText = slash >= 0 ? trimmed.slice(0, slash) : trimmed;
  const lenText = slash >= 0 ? trimmed.slice(slash + 1) : null;
  if (lenText !== null && !/^[0-9]{1,3}$/.test(lenText)) return null;
  const ip = parseIp(addrText);
  if (!ip) return null;
  if (ip.family === 4) {
    // IPv6 표기의 mapped 주소였다면 길이가 96 이상이어야 의미가 있다
    const mapped = addrText.indexOf(":") >= 0;
    let length = lenText === null ? 32 : Number(lenText);
    if (mapped) {
      if (lenText === null) length = 32;
      else {
        if (length < 96 || length > 128) return null;
        length -= 96;
      }
    }
    if (length > 32) return null;
    const mask = length === 0 ? 0 : (0xffffffff << (32 - length)) >>> 0;
    return { family: 4, net: (ip.value & mask) >>> 0, length };
  }
  const length = lenText === null ? 128 : Number(lenText);
  if (length > 128) return null;
  return { family: 6, net: ip.bytes, length };
}

export function prefixContains(prefix: Prefix, ip: ParsedIp): boolean {
  if (prefix.family !== ip.family) return false;
  if (prefix.family === 4 && ip.family === 4) {
    if (prefix.length === 0) return true;
    const mask = (0xffffffff << (32 - prefix.length)) >>> 0;
    return ((ip.value & mask) >>> 0) === (prefix.net as number);
  }
  if (prefix.family === 6 && ip.family === 6) {
    const net = prefix.net as Uint8Array;
    const fullBytes = Math.floor(prefix.length / 8);
    for (let i = 0; i < fullBytes; i++) if (ip.bytes[i] !== net[i]) return false;
    const rest = prefix.length % 8;
    if (rest === 0) return true;
    const mask = (0xff << (8 - rest)) & 0xff;
    return (ip.bytes[fullBytes] & mask) === (net[fullBytes] & mask);
  }
  return false;
}

/** 접두사 집합. 몇백 개 규모라 선형 탐색으로 충분하다(주소 종류별 배열로 나눠 비교 횟수를 줄인다). */
export class PrefixSet {
  private v4: Prefix[] = [];
  private v6: Prefix[] = [];

  add(prefix: Prefix): void {
    (prefix.family === 4 ? this.v4 : this.v6).push(prefix);
  }

  get size(): number {
    return this.v4.length + this.v6.length;
  }

  get counts(): { v4: number; v6: number } {
    return { v4: this.v4.length, v6: this.v6.length };
  }

  contains(ip: ParsedIp): boolean {
    const list = ip.family === 4 ? this.v4 : this.v6;
    for (const p of list) if (prefixContains(p, ip)) return true;
    return false;
  }
}
