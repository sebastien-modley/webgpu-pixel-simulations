import { pixelMaths } from "./shader_utils";

export default function shader_simulation(
    device: GPUDevice,
    WORKGROUP_SIZE: number
) {
    return /* wgsl */ `
        //includes
        ${pixelMaths}

        fn empty_cellStateIntentTemp(i: u32) {
            cellStateIntentTemp[i * 5] = 0;
            cellStateIntentTemp[i * 5 + 1] = 0;
            cellStateIntentTemp[i * 5 + 2] = 0;
            cellStateIntentTemp[i * 5 + 3] = 0;
            cellStateIntentTemp[i * 5 + 4] = 0;
        }

        fn empty_cellStateKeepingTemp(i: u32) {
            cellStateKeepingTemp[i * 5] = 0;
            cellStateKeepingTemp[i * 5 + 1] = 0;
            cellStateKeepingTemp[i * 5 + 2] = 0;
            cellStateKeepingTemp[i * 5 + 3] = 0;
            cellStateKeepingTemp[i * 5 + 4] = 0;
        }

        fn cellValue(x: u32, y: u32) -> u32 {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return 1;}
            return cellStateIn[cellIndex(vec2u(x,y))];
        }

        fn cellIntentIndex(i:u32, offset:vec2i) -> u32 {
            return i*5 + 
                u32(1 * abs(offset.x) + max(offset.x, 0)) +
                u32(3 * abs(offset.y) + max(offset.y, 0))
            ;
        }
        fn cellKeepingIndex(i:u32, offset:vec2i) -> u32 {
            return cellIntentIndex(i, offset);
        }

        //grid dimensions
        @group(0) @binding(0) var<uniform> grid:vec2f; 
        //1 for each cell
        @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
        @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;
        //5 for each cell (itself + each side neighbour)
        @group(0) @binding(3) var<storage, read_write> cellStateIntentTemp: array<u32>;
        @group(0) @binding(4) var<storage, read_write> cellStateKeepingTemp: array<u32>;


        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_push(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            empty_cellStateIntentTemp(i);

            //empty? do nothing!
            if cellValue(cell.x, cell.y) == 0 {
                return;
            }

            //bottom empty - declare intent!
            if cellValue(cell.x, cell.y - 1) == 0 {
                cellStateIntentTemp[cellIntentIndex(i, vec2i(0, -1))] = 1;
            }
            else {
                cellStateIntentTemp[cellIntentIndex(i, vec2i(0,0))] = 1;
            }
            //todo: left empty? / right empty?
        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_pull(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            empty_cellStateKeepingTemp(i);
            
            if cellStateIntentTemp[cellIntentIndex(i, vec2i(0,0))] == 1 {
                return; //we're staying in place
            }

            let i_top = cellIndex(vec2u(cell.x, cell.y+1));
            if cellStateIntentTemp[cellIntentIndex(i_top, vec2i(0,-1))] == 1 {
                cellStateIntentTemp[cellIntentIndex(i_top, vec2i(0,-1))] = 0;
                cellStateKeepingTemp[cellKeepingIndex(i, vec2i(0,1))] = 1;
            }
        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_update(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);

            cellStateOut[i] = cellStateIntentTemp[cellIntentIndex(i, vec2i(0,0))] + cellStateKeepingTemp[cellKeepingIndex(i, vec2i(0,1))];
        }
    `;
}
