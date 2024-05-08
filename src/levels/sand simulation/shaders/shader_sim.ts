import { pixelMaths } from "./shader_utils";

export default function shader_simulation(
    device: GPUDevice,
    WORKGROUP_SIZE: number
) {
    return /* wgsl */ `
        //includes

        @group(0) @binding(0) var<uniform> grid:vec2f;
        
        //1 for each cell
        @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
        //5 for each cell (itself + each side neighbour)
        @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;


        //helpers
        fn cellIndex(cell: vec2u) -> u32 {
            return (cell.y % u32(grid.y)) * u32(grid.x) + (cell.x % u32(grid.x));
        }

        fn cellValue(x: u32, y: u32) -> u32 {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return 1;}
            return cellStateIn[cellIndex(vec2u(x,y))];
        }

        // fn emptyCellStateIntent(i: u32) {
        //     // cellStateIntentOut[i * 5] = 0;
        //     // cellStateIntentOut[i * 5 + 1] = 0;
        //     // cellStateIntentOut[i * 5 + 2] = 0;
        //     // cellStateIntentOut[i * 5 + 3] = 0;
        //     // cellStateIntentOut[i * 5 + 4] = 0;
        // }


        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn computeMain(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            let i = cellIndex(cell.xy);

            switch cellValue(cell.x, cell.y) {
                case 1: { // cell active
                    switch cellValue(cell.x, cell.y - 1) {
                        case 0: { // bottom inactive - swap
                            cellStateOut[i] = 0;
                            cellStateOut[cellIndex(vec2u(cell.x, cell.y-1))] = 1;
                        }
                        case 1: { // bottom active (or out-of-bounds) - stay
                            cellStateOut[i] = 1;
                        }
                        default: {}
                    }
                }
                case 0: { // cell inactive
                    if (
                        cellValue(cell.x, cell.y - 1) == 0
                    &&  cell.y >= 0
                    ) { // bottom inactive - keep it so (for synchronisation)
                        cellStateOut[cellIndex(vec2u(cell.x, cell.y-1))] = 0;
                    }
                    if (cell.y == u32(grid.y) - 1) {
                        cellStateOut[i] = 0; //no-one else will reset me because I'm at the top
                    }
                }
                default: {}
            }            
            // let isActive = cellValue(cell.x, cell.y) == 1;
            // let isBelowActive = cellValue(cell.x, cell.y - 1) == 1;
            // if (isActive) {
            //     cellStateOut[i] = select(0u,1u, isBelowActive);
            //     // cellStateOut[cellIndex(vec2u(cell.x, cell.y-1))] = select(0u, 1u, isBelowActive);    
            // }
            // else {

            // }
        }
    `;
}
