import {
    ArrayDefinition,
    StructuredView,
    isTypedArray,
    makeShaderDataDefinitions,
    makeStructuredView,
} from "webgpu-utils";
import { StatLogger } from "../../utils/StatLogger";
import shader_simulation from "./shaders/shader_sim";
import shader_visuals from "./shaders/shader_visuals";
import { shader_data } from "./shaders/shader_data";

const GRID_SIZE = 128;
const UPDATE_INTERVAL = 16 * 2; //ms
const WORKGROUP_SIZE = 4;
const LOG_EVERY_X_FRAMES = 120;
const RENDERING_ENABLED = true;
const ITERATIONS_PER_FRAME = 1;

const statLogger = new StatLogger(LOG_EVERY_X_FRAMES);

function run(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat
) {
    const shaderDefs = makeShaderDataDefinitions(shader_data);

    const arrayBuffers = {
        cellStateIn: new ArrayBuffer(
            (
                shaderDefs.storages["cellStateIn"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE
        ),
        cellStateOut: new ArrayBuffer(
            (
                shaderDefs.storages["cellStateOut"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE
        ),
        neighbourhood_intent: new ArrayBuffer(
            (
                shaderDefs.storages["neighbourhood_intent"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE *
                9
        ),
        neighbourhood_maintain: new ArrayBuffer(
            (
                shaderDefs.storages["neighbourhood_maintain"]
                    .typeDefinition as ArrayDefinition
            ).elementType.size *
                GRID_SIZE *
                GRID_SIZE *
                9
        ),
    };

    const shaderDataObjects: { [key: string]: StructuredView } = {
        grid: makeStructuredView(shaderDefs.uniforms["grid"]),
        time: makeStructuredView(shaderDefs.uniforms["time"]),
        cellStateIn: makeStructuredView(
            shaderDefs.storages["cellStateIn"],
            arrayBuffers.cellStateIn
        ),
        cellStateOut: makeStructuredView(
            shaderDefs.storages["cellStateIn"],
            arrayBuffers.cellStateOut
        ),
        neighbourhood_intent: makeStructuredView(
            shaderDefs.storages["neighbourhood_intent"],
            arrayBuffers.neighbourhood_intent
        ),
        neighbourhood_maintain: makeStructuredView(
            shaderDefs.storages["neighbourhood_maintain"],
            arrayBuffers.neighbourhood_maintain
        ),
    };

    const shaderDataUsages: { [key: string]: number } = {
        grid: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        time: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        cellStateIn: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        cellStateOut: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        neighbourhood_intent: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        neighbourhood_maintain:
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    };

    const shaderDataBuffers: { [key: string]: GPUBuffer } = {};

    shaderDataObjects.grid.set([GRID_SIZE, GRID_SIZE]);
    shaderDataObjects.time.set(window.performance.now());
    const cellStartData = Array(GRID_SIZE * GRID_SIZE);
    for (let x = 0; x < GRID_SIZE; x++) {
        cellStartData[(GRID_SIZE - 1) * GRID_SIZE + x] = {
            fire: 36,
        };
    }
    for (let x = 0; x < GRID_SIZE; x++) {
        for (
            let y = (GRID_SIZE * 3) / 4 - 10;
            y < (GRID_SIZE * 3) / 4 + 10;
            y++
        ) {
            cellStartData[y * GRID_SIZE + x] = {
                wood: 100,
            };
        }
    }
    shaderDataObjects.cellStateIn.set(cellStartData);

    for (var shaderDataElementName in shaderDataObjects) {
        if (!shaderDataObjects.hasOwnProperty(shaderDataElementName)) continue;
        if (
            shaderDataObjects[shaderDataElementName].arrayBuffer.byteLength == 0
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

    const cellShaderModule = device.createShaderModule({
        label: "Visuals shader",
        code: shader_visuals(),
    });

    const simulationShaderModule = device.createShaderModule({
        label: "Simulation shader",
        code: shader_simulation(device, WORKGROUP_SIZE),
    });

    const bindGroupLayout = device.createBindGroupLayout({
        label: "Cell Bind Group Layout",
        entries: [
            {
                binding: 0,
                visibility:
                    GPUShaderStage.VERTEX |
                    GPUShaderStage.FRAGMENT |
                    GPUShaderStage.COMPUTE,
                buffer: {}, // Grid uniform buffer
            },
            {
                binding: 1,
                visibility:
                    GPUShaderStage.VERTEX |
                    GPUShaderStage.FRAGMENT |
                    GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" }, // Cell state input buffer
            },
            {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }, // Cell state output buffer
            },
            {
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }, //intent temp
            },
            {
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }, //keeping temp
            },
            {
                binding: 5,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {}, // time uniform buffer
            },
        ],
    });

    const bindGroups = [
        device.createBindGroup({
            label: "Cell renderer bind group A",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: shaderDataBuffers.grid },
                },
                {
                    binding: 1,
                    resource: { buffer: shaderDataBuffers.cellStateIn },
                },
                {
                    binding: 2,
                    resource: { buffer: shaderDataBuffers.cellStateOut },
                },
                {
                    binding: 3,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_intent,
                    },
                },
                {
                    binding: 4,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_maintain,
                    },
                },
                {
                    binding: 5,
                    resource: { buffer: shaderDataBuffers.time },
                },
            ],
        }),
        device.createBindGroup({
            label: "Cell renderer bind group B",
            layout: bindGroupLayout,

            entries: [
                {
                    binding: 0,
                    resource: { buffer: shaderDataBuffers.grid },
                },
                {
                    binding: 1,
                    resource: { buffer: shaderDataBuffers.cellStateOut },
                },
                {
                    binding: 2,
                    resource: { buffer: shaderDataBuffers.cellStateIn },
                },
                {
                    binding: 3,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_intent,
                    },
                },
                {
                    binding: 4,
                    resource: {
                        buffer: shaderDataBuffers.neighbourhood_maintain,
                    },
                },
                {
                    binding: 5,
                    resource: { buffer: shaderDataBuffers.time },
                },
            ],
        }),
    ];

    const pipelineLayout = device.createPipelineLayout({
        label: "Cell Pipeline Layout",
        bindGroupLayouts: [bindGroupLayout],
    });

    const { vertices, vertexBufferLayout, vertexBuffer } =
        _createVertexBuffer(device);
    const cellPipeline = device.createRenderPipeline({
        label: "Cell pipeline",
        layout: pipelineLayout,
        vertex: {
            module: cellShaderModule,
            entryPoint: "vertexMain",
            buffers: [vertexBufferLayout],
        },
        fragment: {
            module: cellShaderModule,
            entryPoint: "fragmentMain",
            targets: [
                {
                    format: canvasFormat,
                },
            ],
        },
    });

    const simulationPipelines = {
        push: device.createComputePipeline({
            label: "Simulation pipeline: push",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "compute_push",
            },
        }),
        pull: device.createComputePipeline({
            label: "Simulation pipeline: pull",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "compute_pull",
            },
        }),
        update: device.createComputePipeline({
            label: "Simulation pipeline: update",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "compute_update",
            },
        }),
    };

    let previousFrameTime = window.performance.now();
    let simulationStep = 0;
    let frames = 0;
    updateGrid();

    function dispatchComputePass(encoder: GPUCommandEncoder) {
        const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
        const computePass = encoder.beginComputePass();

        const timeData = new Float32Array([window.performance.now()]);
        device.queue.writeBuffer(shaderDataBuffers.time, 0, timeData);

        for (let i = 0; i < ITERATIONS_PER_FRAME; i++) {
            if (i > 0) {
                simulationStep++;
            }
            computePass.setBindGroup(0, bindGroups[simulationStep % 2]);

            computePass.setPipeline(simulationPipelines.push);
            computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

            computePass.setPipeline(simulationPipelines.pull);
            computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

            computePass.setPipeline(simulationPipelines.update);
            computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
        }

        computePass.end();
    }

    async function updateGrid() {
        statLogger.log(
            "fps",
            1000 / (window.performance.now() - previousFrameTime)
        );

        previousFrameTime = window.performance.now();

        const encoder = device.createCommandEncoder();

        dispatchComputePass(encoder);

        simulationStep++;
        frames++;

        // Start a render pass
        if (RENDERING_ENABLED) {
            const pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: context.getCurrentTexture().createView(),
                        loadOp: "clear",
                        storeOp: "store",
                        clearValue: [0, 0, 0, 1], //background color
                    },
                ],
            });
            // Draw the grid.
            pass.setPipeline(cellPipeline);
            pass.setVertexBuffer(0, vertexBuffer);

            pass.setBindGroup(0, bindGroups[simulationStep % 2]);

            pass.draw(
                vertices.length / 2,
                /*instances=*/ GRID_SIZE * GRID_SIZE
            );
            pass.end();
        }
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();

        const timeDiff = window.performance.now() - previousFrameTime;
        statLogger.log("calc time", timeDiff);

        setTimeout(() => updateGrid(), Math.max(0, UPDATE_INTERVAL - timeDiff));
    }
}

export default run;

function _createVertexBuffer(device: GPUDevice) {
    const vertices = new Float32Array([
        -1.0, -1.0, 1.0, -1.0, 1.0, 1.0,

        -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
    ]);
    const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);
    const vertexBufferLayout: GPUVertexBufferLayout = {
        arrayStride: vertices.BYTES_PER_ELEMENT * 2,
        attributes: [
            {
                format: "float32x2", //each vertex is 2 floats: (x,y)
                offset: 0,
                shaderLocation: 0,
            },
        ],
    };
    return { vertices, vertexBufferLayout, vertexBuffer };
}
