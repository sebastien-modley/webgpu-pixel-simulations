import { describe, expect, test } from "vitest";

import { TypedArray } from "webgpu-utils";

import { WebgpuTesting } from "../../../../TestTemplates";

import { euler_maths } from "../../../../../src/utils/webgpu/shader scripts/euler_maths";

const shader = /*wgsl*/ `
//includes
${euler_maths}


@compute
@workgroup_size(1,1,1)
fn compute() {
    result = angle_between(a,b);
    result = degrees(result);
}
`;

describe("Custom gpu functions", () => {
    describe("Angle between vectors", () => {
        test.each<{ a: number[]; b: number[]; expected: number }>([
            { a: [1, 0], b: [1, 0], expected: 0 },
            { a: [0, 1], b: [1, 0], expected: 90 },
            { a: [1, 0], b: [-1, 0], expected: 180 },
            { a: [1, 1], b: [-1, -1], expected: 180 },
            { a: [1, 0], b: [1, 1], expected: 45 },
        ])("($a, $b) => $expected", async ({ a, b, expected }) => {
            const output = await WebgpuTesting.Unit.scalarTest(
                shader,
                [
                    { name: "a", value: a, unit: "vec2f" },
                    { name: "b", value: b, unit: "vec2f" },
                ],
                [{ name: "result", unit: "f32" }],
                "addition test"
            );
            expect(Array.from(output["result"] as TypedArray)).toBeCloseTo(
                expected
            );
        });
    });
});
