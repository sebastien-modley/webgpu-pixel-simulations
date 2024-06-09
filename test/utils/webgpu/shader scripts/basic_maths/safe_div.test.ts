import { describe, expect, test } from "vitest";

import { TypedArray } from "webgpu-utils";

import { WebgpuTesting } from "../../../../TestTemplates";

import { basic_maths } from "../../../../../src/utils/webgpu/shader scripts/basic_maths";

describe("Custom gpu functions: basic maths", () => {
    describe("Safe division: f32", () => {
        test.each<{
            a: [number];
            b: [number];
            expected: [number];
        }>([
            { a: [0], b: [0], expected: [0] },
            { a: [10], b: [0], expected: [0] },
            { a: [10], b: [5], expected: [2] },
            { a: [3245], b: [2345.1324], expected: [3245 / 2345.1324] },
        ])("($a, $b) => $expected", async ({ a, b, expected }) => {
            const shader = /*wgsl*/ `
            //includes
            ${basic_maths}
            
            @compute
            @workgroup_size(1,1,1)
            fn compute() {
                result = safe_div_f32(a,b,f32());
            }
            `;

            const output = await WebgpuTesting.Unit.scalarTest(
                shader,
                [
                    { name: "a", value: a, unit: "f32" },
                    { name: "b", value: b, unit: "f32" },
                ],
                [{ name: "result", unit: "f32" }],
                "addition test"
            );
            (output["result"] as TypedArray).forEach((elem, idx) =>
                expect(elem).toBeCloseTo(expected[idx])
            );
            console.log(output["result"], " == ", expected);
        });
    });

    describe("Safe division: vec2f", () => {
        test.each<{
            a: [number, number];
            b: [number, number];
            expected: [number, number];
        }>([
            { a: [0, 0], b: [0, 0], expected: [0, 0] },
            { a: [1, 0], b: [1, 0], expected: [1, 0] },
            { a: [20, 90], b: [134, 435], expected: [20 / 134, 90 / 435] },
        ])("($a, $b) => $expected", async ({ a, b, expected }) => {
            const shader = /*wgsl*/ `
            //includes
            ${basic_maths}
            
            @compute
            @workgroup_size(1,1,1)
            fn compute() {
                result = safe_div_vec2f(a,b,vec2f());
            }
            `;

            const output = await WebgpuTesting.Unit.scalarTest(
                shader,
                [
                    { name: "a", value: a, unit: "vec2f" },
                    { name: "b", value: b, unit: "vec2f" },
                ],
                [{ name: "result", unit: "vec2f" }],
                "addition test"
            );
            (output["result"] as TypedArray).forEach((elem, idx) =>
                expect(elem).toBeCloseTo(expected[idx])
            );
            console.log(output["result"], " == ", expected);
        });
    });
});
