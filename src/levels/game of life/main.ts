const GRID_SIZE = 4;
const UPDATE_INTERVAL = 600; //ms
const WORKGROUP_SIZE = 8;

function run(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat
) {
    //create vertices
    const vertices = new Float32Array([
        //triangle 1 (Blue)
        -0.8, -0.8, 0.8, -0.8, 0.8, 0.8,

        //triangle 2 (Red)
        -0.8, -0.8, 0.8, 0.8, -0.8, 0.8,
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

    // Create a uniform buffer that describes the grid.
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    const uniformBuffer = device.createBuffer({
        label: "Grid Uniforms",
        size: uniformArray.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

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
        cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
    device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

    const cellShaderModule = device.createShaderModule({
        label: "Cell shader",
        code: /* wgsl */ `
            @group(0) @binding(0) var<uniform> grid: vec2f;
            @group(0) @binding(1) var<storage> cellState: array<u32>;

            struct VertexInput {
                @location(0) pos: vec2f,
                @builtin(instance_index) instance: u32                
            };

            struct VertexOutput {
                @builtin(position) gridPos: vec4f,
                @location(0) cell: vec2f,
            };

            @vertex
            fn vertexMain(input: VertexInput) -> VertexOutput {
                let i = f32(input.instance);
                let cell = vec2f(i%grid.x,floor(i/grid.x));
                let state = f32(cellState[input.instance]);

                let cellOffset = cell / grid * 2;
                let gridPos = (input.pos*state+1) / grid - 1 + cellOffset;

                //make output
                var output: VertexOutput;
                output.gridPos = vec4f(gridPos,0,1);
                output.cell = cell;
                return output;
            }

            @fragment
            fn fragmentMain(@location(0) cell: vec2f) -> @location(0) vec4f {
                let rg = cell/grid;
                return vec4f(rg,1-rg.x,1);
            }
        `,
    });

    const simulationShaderModule = device.createShaderModule({
        label: "Game of Life simulation shader",
        code: /* wgsl */ `
            @group(0) @binding(0) var<uniform> grid:vec2f;
            
            @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
            @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;


            //helpers
            fn cellIndex(cell: vec2u) -> u32 {
                return (cell.y % u32(grid.y)) * u32(grid.x) + (cell.x % u32(grid.x));
            }

            fn cellActive(x: u32, y: u32) -> u32 {
                return cellStateIn[cellIndex(vec2u(x,y))];
            }

            fn activeNeighbours(x: u32, y: u32) -> u32 {
                return 
                    cellActive(x+1, y+1) + 
                    cellActive(x+1, y) + 
                    cellActive(x+1, y-1) + 
                    cellActive(x, y+1) + 
                    cellActive(x, y-1) + 
                    cellActive(x-1, y+1) + 
                    cellActive(x-1, y) + 
                    cellActive(x-1, y - 1);
            }

            fn nextState(x: u32, y: u32, i: u32) -> u32 {
                let activeNeighbours = activeNeighbours(x, y);
                let isActive = cellStateIn[i];
                switch activeNeighbours {
                    case 2: {
                        return isActive;
                    }
                    case 3: {
                        return 1;
                    }
                    default: {
                        return 0;
                    }
                }
            }

            @compute
            @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
            fn computeMain(
                @builtin(global_invocation_id) cell: vec3u
            ) {
                let i = cellIndex(cell.xy);
                switch cellActive(cell.x, cell.y) {
                    case 1: {
                        cellStateOut[i] = cellActive(cell.x, cell.y - 1);
                    }
                    case 0: {
                        cellStateOut[i] = 0;
                    }
                    default: {}
                }
                // cellStateOut[i] = nextState(cell.x, cell.y, i);
            }
        `,
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
                    resource: { buffer: uniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: cellStateStorage[0] },
                },
                {
                    binding: 2,
                    resource: { buffer: cellStateStorage[1] },
                },
            ],
        }),
        device.createBindGroup({
            label: "Cell renderer bind group B",
            layout: bindGroupLayout,

            entries: [
                {
                    binding: 0,
                    resource: { buffer: uniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: cellStateStorage[1] },
                },
                {
                    binding: 2,
                    resource: { buffer: cellStateStorage[0] },
                },
            ],
        }),
    ];

    const pipelineLayout = device.createPipelineLayout({
        label: "Cell Pipeline Layout",
        bindGroupLayouts: [bindGroupLayout],
    });

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

    const simulationPipeline = device.createComputePipeline({
        label: "Simulation pipeline",
        layout: pipelineLayout,
        compute: {
            module: simulationShaderModule,
            entryPoint: "computeMain",
        },
    });

    let simulationStep = 0;
    setInterval(updateGrid, UPDATE_INTERVAL);

    function updateGrid() {
        const encoder = device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(simulationPipeline);
        computePass.setBindGroup(0, bindGroups[simulationStep % 2]);

        const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
        computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
        computePass.end();

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
    }
}

export default run;
