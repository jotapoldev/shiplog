import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeEnvs } from "./envs.ts";

test("summarizeEnvs: cuenta por ambiente, lo pendiente de llegar a la última rama y lo local", () => {
  const [api, web] = summarizeEnvs(
    [
      { repo: "api", branches: "develop,qa,main", n: 5 },
      { repo: "api", branches: "develop,qa", n: 3 },
      { repo: "api", branches: "develop", n: 2 },
      { repo: "api", branches: null, n: 1 },
      { repo: "web", branches: "develop,master", n: 4 },
    ],
    (r) => (r === "api" ? ["develop", "qa", "main"] : ["develop", "main"]),
  );
  assert.deepEqual(api.envs, [{ env: "develop", n: 10 }, { env: "qa", n: 8 }, { env: "main", n: 5 }]);
  assert.equal(api.pending, 5);
  assert.equal(api.local, 1);
  assert.equal(api.total, 11);
  // master cuenta como main y no queda nada pendiente.
  assert.equal(web.pending, 0);
  assert.deepEqual(web.envs.at(-1), { env: "main", n: 4 });
});
