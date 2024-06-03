import { assert, describe, expect, test } from "vitest";

import {
    ArrayDefinition,
    ShaderDataDefinitions,
    VariableDefinition,
    VariableDefinitions,
    StructuredView,
    isTypedArray,
    makeShaderDataDefinitions,
    makeStructuredView,
} from "webgpu-utils";

import { setupWebgpuWithoutCanvas } from "../../src/utils/webgpu/Setup";

import "../utils/webgpu/TestTemplates";
import { WebgpuTesting } from "../utils/webgpu/TestTemplates";

describe("Basic gpu functions", () => {
    describe("Addition", () => {
        test.each<{ a: number; b: number; expected: number }>([
            { a: 1, b: 2, expected: 3 },
        ])("$a + $b == $expected", async ({ a, b, expected }) => {
            const shader = /*wgsl*/ `
            @compute
            @workgroup_size(1,1,1)
            fn compute() {
                result = a + b;
            }
            `;

            const output = await WebgpuTesting.Unit.scalarTest(
                shader,
                [
                    { name: "a", value: a },
                    { name: "b", value: b },
                ],
                [{ name: "result" }],
                "addition test"
            );
            console.error("yarrr");
            expect(output["result"][0]).to.equal(expected);
        });
    });
});
