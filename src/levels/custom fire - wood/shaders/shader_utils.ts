export const pixelMaths = /*wgsl*/ `

fn posMod_u(a:u32, b:u32) -> u32{
    let m = a % b;
    return select(m + abs(b), m, m >= 0);
}

//note: wraps around on both dimensions
fn cellIndex(cell: vec2u) -> u32 {
    return posMod_u(cell.y, u32(grid.y)) * u32(grid.x) + posMod_u(cell.x, u32(grid.x));
}

fn computeCellValid(cell: vec3u, grid: vec2u) -> bool {
    return cell.x < grid.x && cell.y < grid.y;
}

fn isWithinBounds(cell: vec2u, grid: vec2u) -> bool {
    return cell.x < grid.x && cell.y < grid.y;
}

fn isCloseToZero(f: f32) -> bool {return abs(f) <= 0.05;}



// static const vec2i neighbours_4[4] = {
//             int2(0,-1),
//     int2(-1,0),     int2(1,0), 
//             int2(0,1)
// };

// int2 neighbourV(int neighbourIndex) {
// return neighbours_4[neighbourIndex];
// }

// fn neighbourArrayIndex(pos: vec2i) -> i32 {
//     //index in neighbours_4
//     return (pos.y>=0) + (pos.x==1) + (pos.y==1)*4;
// }


// int neighbourArrayIndex(int3 pos, int num_neighbours) {
// int index = num_neighbours == 6 ? (pos.z>=0) + (pos.z==1)*4 + (pos.z==0) * ((pos.x!=0) + (pos.x>0) + (pos.y>0)*3) :
// (pos.z+1) * 9 + (pos.y+1) * 3 + (pos.x+1);
// return num_neighbours == 6 ? index : index - (index >= 13);
// }

`;
