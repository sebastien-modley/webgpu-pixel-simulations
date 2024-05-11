import shader_simulation from "./shaders/shader_sim";
import shader_visuals from "./shaders/shader_visuals";

const GRID_SIZE = 128;
const UPDATE_INTERVAL = 16.66667; //ms
const WORKGROUP_SIZE = 8;
const LOGS_ENABLED = false;

function log(s: string) {
    if (LOGS_ENABLED) console.log(s);
}

function run(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat
) {
    // Create a uniform buffer that describes the grid.

    const gridData = new Float32Array([GRID_SIZE, GRID_SIZE]);
    const gridUniform = device.createBuffer({
        label: "Grid Uniforms",
        size: gridData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(gridUniform, 0, gridData);

    // Create a (resizable, compute-writable, shader-readable) storage buffer that stores the game state
    const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
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
    for (let i = 0; i < cellStateArray.length; ++i)
        cellStateArray[i] = Math.random() > 0.99 ? 1 : 0;
    device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

    const intermediateCellStateArray = new Uint32Array(
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
                // Add GPUShaderStage.FRAGMENT here if you are using the `grid` uniform in the fragment shader.
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
        ],
    });

    // Create a bind group to pass the grid uniforms into the pipeline
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
    updateGrid();

    function runComputePass(encoder: GPUCommandEncoder) {
        const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
        const computePass = encoder.beginComputePass();
        computePass.setBindGroup(0, bindGroups[simulationStep % 2]);

        computePass.setPipeline(simulationPipelines.push);
        computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

        computePass.setPipeline(simulationPipelines.pull);
        computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

        computePass.setPipeline(simulationPipelines.update);
        computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

        computePass.end();
    }

    async function updateGrid() {
        log(`fps: ${1000 / (window.performance.now() - previousFrameTime)}`);
        previousFrameTime = window.performance.now();

        const encoder = device.createCommandEncoder();

        runComputePass(encoder);

        simulationStep++;

        // Start a render pass
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

        pass.setBindGroup(0 /*@group(0)*/, bindGroups[simulationStep % 2]);

        pass.draw(vertices.length / 2, /*instances=*/ GRID_SIZE * GRID_SIZE);
        // Finish the render pass and immediately submit it.
        pass.end();
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        var timeDiff = window.performance.now() - previousFrameTime;
        log(`calc time: ${timeDiff} (budget: ${UPDATE_INTERVAL})`);

        UPDATE_INTERVAL <= 0
            ? updateGrid()
            : setTimeout(
                  () => updateGrid(),
                  Math.max(0, UPDATE_INTERVAL - timeDiff)
              );
        if (UPDATE_INTERVAL <= 0) {
            updateGrid();
        }
    }
}

export default run;

function _createVertexBuffer(device: GPUDevice) {
    const vertices = new Float32Array([
        //triangle 1 (Blue)
        -1.0, -1.0, 1.0, -1.0, 1.0, 1.0,

        //triangle 2 (Red)
        -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
    ]);
    const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);
    const vertexBufferLayout: GPUVertexBufferLayout = {
        arrayStride: vertices.BYTES_PER_ELEMENT * 2,
        attributes: [
            {
                format: "float32x2", //each vertex is 2 floats: (x,y)
                offset: 0,
                shaderLocation: 0, // Position, see vertex shader: [0,15]
            },
        ],
    };
    return { vertices, vertexBufferLayout, vertexBuffer };
}
