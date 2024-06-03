import {
    ShaderDataDefinitions,
    StructuredView,
    VariableDefinitions,
    makeShaderDataDefinitions,
    makeStructuredView,
} from "webgpu-utils";
import { setupWebgpuWithoutCanvas } from "../../../src/utils/webgpu/Setup";

export namespace WebgpuTesting.Unit {
    export async function scalarTest(
        shaderCode: string,
        inputs: { name: string; value: number }[],
        outputs: { name: string }[],
        testName: string
    ) {
        const dataBindings: { [key: string]: number } = {};
        inputs.forEach((input, idx) => (dataBindings[input.name] = idx));
        outputs.forEach(
            (output, idx) => (dataBindings[output.name] = inputs.length + idx)
        );

        let shaderData = /*wgsl*/ ``;
        inputs.forEach((input) => {
            shaderData += /*wgsl*/ `@group(0) @binding(${
                dataBindings[input.name]
            }) var<uniform> ${input.name}:f32;\n`;
        });
        outputs.forEach((output) => {
            shaderData += /*wgsl*/ `@group(0) @binding(${
                dataBindings[output.name]
            }) var<storage, read_write> ${output.name}:f32;`;
        });

        const shader = shaderData + "\n" + shaderCode;

        // const shader = /*wgsl*/ `;
        // ${shaderData}

        // @compute
        // @workgroup_size(1,1,1)
        // fn compute() {
        //     result = a + b;
        // }

        // `;

        const { device } = await setupWebgpuWithoutCanvas();
        return await run(device, shader);

        async function run(device: GPUDevice, shader: string) {
            const shaderDefs = makeShaderDataDefinitions(shader);

            const shaderObjectsViews: { [key: string]: StructuredView } =
                makeStructuredViews(shaderDefs);
            inputs.forEach((input) => {
                shaderObjectsViews[input.name].set(input.value);
            });

            let shaderDataUsages: { [key: string]: number } = {};
            inputs.forEach((input) => {
                shaderDataUsages[input.name] =
                    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
            });
            outputs.forEach((output) => {
                shaderDataUsages[output.name] =
                    GPUBufferUsage.STORAGE |
                    GPUBufferUsage.COPY_SRC |
                    GPUBufferUsage.COPY_DST;
            });

            const shaderDataBuffers: { [key: string]: GPUBuffer } =
                createShaderDataBuffers(
                    shaderObjectsViews,
                    shaderDataUsages,
                    device
                );

            const simulationShaderModule = device.createShaderModule({
                label: `${testName} shader module`,
                code: shader,
            });

            const bindGroupLayout = device.createBindGroupLayout({
                label: `${testName} Bind Group Layout`,
                entries: inputs
                    .map<GPUBindGroupLayoutEntry>((input) => {
                        return {
                            binding: dataBindings[input.name],
                            visibility: GPUShaderStage.COMPUTE,
                            buffer: {},
                        };
                    })
                    .concat(
                        outputs.map<GPUBindGroupLayoutEntry>((output) => {
                            return {
                                binding: dataBindings[output.name],
                                visibility: GPUShaderStage.COMPUTE,
                                buffer: { type: "storage" },
                            };
                        })
                    ),
            });

            const bindGroup = device.createBindGroup({
                label: `${testName} compute bind group`,
                layout: bindGroupLayout,
                entries: inputs
                    .map((input) => {
                        return {
                            binding: dataBindings[input.name],
                            resource: { buffer: shaderDataBuffers[input.name] },
                        };
                    })
                    .concat(
                        outputs.map((output) => {
                            return {
                                binding: dataBindings[output.name],
                                resource: {
                                    buffer: shaderDataBuffers[output.name],
                                },
                            };
                        })
                    ),
            });

            const pipelineLayout = device.createPipelineLayout({
                label: `${testName} Pipeline Layout`,
                bindGroupLayouts: [bindGroupLayout],
            });

            const simulationPipelines = {
                compute: device.createComputePipeline({
                    label: `${testName} compute pipeline`,
                    layout: pipelineLayout,
                    compute: {
                        module: simulationShaderModule,
                        entryPoint: "compute",
                    },
                }),
            };

            return await compute();

            async function compute() {
                const encoder = device.createCommandEncoder();

                dispatchComputePass(encoder);

                const outputReadBuffers: { [key: string]: GPUBuffer } = {};
                outputs.forEach((output) => {
                    const buffer = device.createBuffer({
                        size: shaderDataBuffers[output.name].size,
                        usage:
                            GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
                    });
                    encoder.copyBufferToBuffer(
                        shaderDataBuffers[output.name],
                        0,
                        buffer,
                        0,
                        shaderDataBuffers[output.name].size
                    );
                    outputReadBuffers[output.name] = buffer;
                });

                device.queue.submit([encoder.finish()]);
                await device.queue.onSubmittedWorkDone();

                await Promise.all(
                    outputs.map((output) =>
                        outputReadBuffers[output.name].mapAsync(GPUMapMode.READ)
                    )
                );
                const outputValues: { [key: string]: Float32Array } = {};
                outputs.forEach((output) => {
                    outputValues[output.name] = new Float32Array(
                        outputReadBuffers[output.name].getMappedRange()
                    );
                });
                return outputValues;
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

    function makeStructuredViews(shaderDefs: ShaderDataDefinitions): {
        [key: string]: StructuredView;
    } {
        let structuredViews: { [key: string]: StructuredView } = {};
        for (var shaderDataDefType of ["uniforms", "storages"]) {
            const shaderInputs = shaderDefs[
                shaderDataDefType
            ] as VariableDefinitions;

            for (var shaderInputName in shaderInputs) {
                if (!shaderInputs.hasOwnProperty(shaderInputName)) continue;
                if (structuredViews[shaderInputName] !== undefined) {
                    console.error(
                        `Shader input definition "${shaderInputName}" has already been defined.`
                    );
                }
                structuredViews[shaderInputName] = makeStructuredView(
                    shaderInputs[shaderInputName]
                );
            }
        }
        return structuredViews;
    }

    function createShaderDataBuffers(
        shaderDataObjects: { [key: string]: StructuredView },
        shaderDataUsages: { [key: string]: number },
        device: GPUDevice
    ) {
        let shaderDataBuffers: { [key: string]: GPUBuffer } = {};
        for (var shaderDataElementName in shaderDataObjects) {
            if (!shaderDataObjects.hasOwnProperty(shaderDataElementName))
                continue;
            if (
                shaderDataObjects[shaderDataElementName].arrayBuffer
                    .byteLength == 0
            ) {
                console.error(
                    `Buffer '${shaderDataElementName}' created with byte length 0!`
                );
            }
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
        return shaderDataBuffers;
    }
}
