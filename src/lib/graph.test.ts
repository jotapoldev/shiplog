import assert from "node:assert/strict";
import { test } from "node:test";
import { family, layout, type RawCommit } from "./graph.ts";

const c = (hash: string, parents: string[], raw = hash, at = hash): RawCommit => ({ hash, parents, at, email: "", author: "", raw });

test("layout: feature que se mergea a develop", () => {
  // M (merge) <- D2 <- D1 ; M <- F1 <- D1
  const { nodes, segs, width } = layout(
    [c("M", ["D2", "F1"]), c("F1", ["D1"]), c("D2", ["D1"]), c("D1", [])],
    [["develop", "M"], ["feature/x", "F1"]],
  );
  assert.equal(width, 2);
  assert.deepEqual(nodes.map((n) => [n.hash, n.col, n.branch]), [["M", 0, "develop"], ["F1", 1, "feature/x"], ["D2", 0, "develop"], ["D1", 0, "develop"]]);
  assert.ok(nodes[0].merge);
  assert.deepEqual(nodes[0].refs, ["develop"]);
  // De M salen dos tramos: a D2 (carril 0) y a F1 (carril 1); F1 vuelve a converger en D1.
  assert.deepEqual(segs.filter((s) => s.row === 0).map((s) => [s.from, s.to]).sort(), [[0, 0], [0, 1]]);
  assert.ok(segs.some((s) => s.row === 2 && s.from === 1 && s.to === 0));
});

test("layout: cherry-pick y prioridad de ramas", () => {
  const { nodes } = layout([c("A", ["X"], "fix: algo", "t1"), c("B", ["X"], "fix: algo", "t1"), c("X", [])], [["main", "A"], ["develop", "B"]]);
  assert.deepEqual(nodes[0].twins, ["B"]);
  assert.equal(nodes[2].branch, "main");
  assert.equal(nodes[0].type, "fix");
});

test("family", () => {
  assert.equal(family("master"), "main");
  assert.equal(family("feature/#6546"), "feature");
  assert.equal(family("oscar-dev"), "other");
});
