import test from "node:test";
import assert from "node:assert/strict";
import { hostnameOfUrl, normalizeUrl } from "./normalizeUrl";

test("normalizeUrl adds https when the scheme is missing", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com");
  assert.equal(normalizeUrl("  www.example.com/a  "), "https://www.example.com/a");
  assert.equal(normalizeUrl("//example.com"), "https://example.com");
});

test("normalizeUrl keeps existing schemes and empty input", () => {
  assert.equal(normalizeUrl("http://example.com"), "http://example.com");
  assert.equal(normalizeUrl("HTTPS://example.com"), "HTTPS://example.com");
  assert.equal(normalizeUrl(""), "");
});

test("hostnameOfUrl works with or without a scheme", () => {
  assert.equal(hostnameOfUrl("example.com/x"), "example.com");
  assert.equal(hostnameOfUrl("https://a.example.com"), "a.example.com");
  assert.equal(hostnameOfUrl(""), undefined);
});
