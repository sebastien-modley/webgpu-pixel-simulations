import { assert, test } from "vitest";

test("navigator exists", () => {
    assert.exists(navigator);
});
