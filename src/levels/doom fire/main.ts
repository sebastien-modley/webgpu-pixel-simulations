import { StatLogger } from "../../utils/StatLogger";
import shader_simulation from "./shaders/shader_sim";
import shader_visuals from "./shaders/shader_visuals";

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
    // Create a uniform buffer that describes the grid.

    const timeData = new Float32Array([window.performance.now()]);
    const timeUniform = device.createBuffer({
        label: "Time Uniform",
        size: timeData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(timeUniform, 0, timeData);
    const gridData = new Uint32Array([GRID_SIZE, GRID_SIZE]);
    const gridUniform = device.createBuffer({
        label: "Grid Uniforms",
        size: gridData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(gridUniform, 0, gridData);

    // Create a (resizable, compute-writable, shader-readable) storage buffer that stores the game state
    const cellStateArray = new Float32Array(GRID_SIZE * GRID_SIZE);
    const cellStateStorage = [
        device.createBuffer({
            label: "Cell State A",
            size: cellStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
        device.createBuffer({
            label: "Cell State B",
            size: cellStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
    ];
    for (let x = 0; x < GRID_SIZE; x++) {
        cellStateArray[(GRID_SIZE - 1) * GRID_SIZE + x] = 36;
    }
    device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

    const intermediateCellStateArray = new Float32Array(
        GRID_SIZE * GRID_SIZE * 9
    );
    const intermediateCellStateStorage = [
        device.createBuffer({
            label: "Cell State Intent Temp",
            size: intermediateCellStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
        device.createBuffer({
            label: "Cell State Keeping Temp",
            size: intermediateCellStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
    ];

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
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
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
                visibility: GPUShaderStage.COMPUTE,
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
                    resource: { buffer: gridUniform },
                },
                {
                    binding: 1,
                    resource: { buffer: cellStateStorage[0] },
                },
                {
                    binding: 2,
                    resource: { buffer: cellStateStorage[1] },
                },
                {
                    binding: 3,
                    resource: { buffer: intermediateCellStateStorage[0] },
                },
                {
                    binding: 4,
                    resource: { buffer: intermediateCellStateStorage[1] },
                },
                {
                    binding: 5,
                    resource: { buffer: timeUniform },
                },
            ],
        }),
        device.createBindGroup({
            label: "Cell renderer bind group B",
            layout: bindGroupLayout,

            entries: [
                {
                    binding: 0,
                    resource: { buffer: gridUniform },
                },
                {
                    binding: 1,
                    resource: { buffer: cellStateStorage[1] },
                },
                {
                    binding: 2,
                    resource: { buffer: cellStateStorage[0] },
                },
                {
                    binding: 3,
                    resource: { buffer: intermediateCellStateStorage[0] },
                },
                {
                    binding: 4,
                    resource: { buffer: intermediateCellStateStorage[1] },
                },
                {
                    binding: 5,
                    resource: { buffer: timeUniform },
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
    let averageMs = 0;
    let averageFrames = 0;
    updateGrid();

    function dispatchComputePass(encoder: GPUCommandEncoder) {
        const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
        const computePass = encoder.beginComputePass();

        const timeData = new Float32Array([window.performance.now()]);
        device.queue.writeBuffer(timeUniform, 0, timeData);

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
                        clearValue: [0, 0, 0.4, 1], //background color
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
