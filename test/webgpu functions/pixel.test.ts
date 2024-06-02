import { assert, describe, expect, test } from "vitest";

import {
    ArrayDefinition,
    StructuredView,
    isTypedArray,
    makeShaderDataDefinitions,
    makeStructuredView,
} from "webgpu-utils";

import { setupWebgpuWithoutCanvas } from "../../src/utils/webgpu/Setup";

describe("Basic gpu functions", () => {
    describe("Addition", () => {
        test.each<{ a: number; b: number; expected: number }>([
            { a: 1, b: 1, expected: 2 },
        ])("$a + $b == $expected", async ({ a, b, expected }) => {
            await testAddition(a, b, expected);
        });
    });
});

async function testAddition(a: number, b: number, expected: number) {
    const shader = /*wgsl*/ `
    @group(0) @binding(0) var<uniform> a:f32;
    @group(0) @binding(1) var<uniform> b:f32;
    @group(0) @binding(2) var<storage, read_write> result:f32;

    @compute
    @workgroup_size(1,1,1)
    fn compute() {
        result = a + b;
    }

    `;

    const { device } = await setupWebgpuWithoutCanvas();
    await run(device, shader);

    async function run(device: GPUDevice, shader: string) {
        const shaderDefs = makeShaderDataDefinitions(shader);

        const arrayBuffers = {};

        const shaderDataObjects: { [key: string]: StructuredView } = {
            a: makeStructuredView(shaderDefs.uniforms["a"]),
            b: makeStructuredView(shaderDefs.uniforms["b"]),
            result: makeStructuredView(shaderDefs.storages["result"]),
        };

        shaderDataObjects["a"].set(a);
        shaderDataObjects["b"].set(b);

        const shaderDataUsages: { [key: string]: number } = {
            a: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            b: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            result:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_SRC |
                GPUBufferUsage.COPY_DST,
        };

        const shaderDataBuffers: { [key: string]: GPUBuffer } = {};

        for (var shaderDataElementName in shaderDataObjects) {
            if (!shaderDataObjects.hasOwnProperty(shaderDataElementName))
                continue;
            if (
                shaderDataObjects[shaderDataElementName].arrayBuffer
                    .byteLength == 0
            )
                console.error(
                    `Buffer '${shaderDataElementName}' created with byte length 0!`
                );
            if (!shaderDataUsages.hasOwnProperty(shaderDataElementName)) {
                console.error(
                    `Buffer '${shaderDataElementName}' does not have any assigned usages!`
                );
            }
            shaderDataBuffers[shaderDataElementName] = device.createBuffer({
                label: `Buffer '${shaderDataElementName}'`,
                size: shaderDataObjects[shaderDataElementName].arrayBuffer
                    .byteLength,
                usage: shaderDataUsages[shaderDataElementName],
            });
            device.queue.writeBuffer(
                shaderDataBuffers[shaderDataElementName],
                0,
                shaderDataObjects[shaderDataElementName].arrayBuffer
            );
        }

        console.log(shaderDataBuffers);

        const simulationShaderModule = device.createShaderModule({
            label: "Test Simulation shader: addition",
            code: shader,
        });

        const bindGroupLayout = device.createBindGroupLayout({
            label: "Cell Bind Group Layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {} },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {} },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
            ],
        });

        const bindGroup = device.createBindGroup({
            label: "Test compute bind group",
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: shaderDataBuffers["a"] } },
                { binding: 1, resource: { buffer: shaderDataBuffers["b"] } },
                {
                    binding: 2,
                    resource: { buffer: shaderDataBuffers["result"] },
                },
            ],
        });

        const pipelineLayout = device.createPipelineLayout({
            label: "Cell Pipeline Layout",
            bindGroupLayouts: [bindGroupLayout],
        });

        const simulationPipelines = {
            compute: device.createComputePipeline({
                label: "Test compute pipeline: addition",
                layout: pipelineLayout,
                compute: {
                    module: simulationShaderModule,
                    entryPoint: "compute",
                },
            }),
        };

        const result = await compute();
        expect(result[0]).to.equal(expected);

        async function compute() {
            const encoder = device.createCommandEncoder();

            dispatchComputePass(encoder);

            const result_readBuffer = device.createBuffer({
                size: shaderDataBuffers["result"].size,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            encoder.copyBufferToBuffer(
                shaderDataBuffers["result"],
                0,
                result_readBuffer,
                0,
                shaderDataBuffers["result"].size
            );

            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();

            await Promise.all([result_readBuffer.mapAsync(GPUMapMode.READ)]);

            return new Float32Array(result_readBuffer.getMappedRange());
        }

        function dispatchComputePass(encoder: GPUCommandEncoder) {
            const computePass = encoder.beginComputePass();

            computePass.setBindGroup(0, bindGroup);

            computePass.setPipeline(simulationPipelines.compute);
            computePass.dispatchWorkgroups(1, 1, 1);

            computePass.end();
        }
    }
}
