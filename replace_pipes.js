const fs = require('fs');
let code = fs.readFileSync('src/components/Plant3D.tsx', 'utf8');

const regex = /function pipeRoutePoints[\s\S]*?function SampleMarker/m;

const newFunction = `function pipeRoutePoints(from: TreatmentUnit, to: TreatmentUnit, fromPos: THREE.Vector3, toPos: THREE.Vector3, sludge: boolean) {
  const fromScale = unitScale(from);
  const toScale = unitScale(to);
  const key = \`\${from.id}->\${to.id}\`;
  const waterY = 0.78;
  const tertiaryY = 0.62;
  const sludgeY = 0.22;

  if (sludge) {
    if (key === "sedimentation->sludge-holding") {
      const sludgeR = tankWallExtent(to, "z") ?? toScale.z / 2;
      const out = new THREE.Vector3(fromPos.x, sludgeY, fromPos.z + fromScale.z / 2 + 0.18);
      const inn = new THREE.Vector3(toPos.x, sludgeY, toPos.z - sludgeR - 0.05);
      return [out, new THREE.Vector3(out.x, sludgeY, inn.z - 0.6), new THREE.Vector3(inn.x, sludgeY, inn.z - 0.6), inn];
    }
    if (key === "scum-skimming->sludge-holding") {
      const sludgeR = tankWallExtent(to, "z") ?? toScale.z / 2;
      const out = new THREE.Vector3(fromPos.x + fromScale.x / 2 + 0.12, sludgeY, fromPos.z + fromScale.z / 2 + 0.18);
      const inn = new THREE.Vector3(toPos.x, sludgeY, toPos.z - sludgeR - 0.05);
      return [out, new THREE.Vector3(out.x, sludgeY, inn.z - 0.6), new THREE.Vector3(inn.x, sludgeY, inn.z - 0.6), inn];
    }
    if (key === "sludge-holding->screw-press") {
      const sludgeR = tankWallExtent(from, "x") ?? fromScale.x / 2;
      const out = new THREE.Vector3(fromPos.x - sludgeR - 0.05, sludgeY, fromPos.z);
      const inn = new THREE.Vector3(toPos.x + toScale.x / 2 + 0.12, sludgeY, toPos.z);
      return [out, new THREE.Vector3((out.x + inn.x) / 2, sludgeY, out.z), new THREE.Vector3((out.x + inn.x) / 2, sludgeY, inn.z), inn];
    }
  } else {
    if (key === "equalization->aeration") {
      const out = new THREE.Vector3(fromPos.x + fromScale.x / 2 + 0.14, waterY, fromPos.z);
      const inn = new THREE.Vector3(toPos.x - toScale.x / 2 - 0.14, waterY, toPos.z);
      return [out, new THREE.Vector3((out.x + inn.x) / 2, waterY, out.z), new THREE.Vector3((out.x + inn.x) / 2, waterY, inn.z), inn];
    }
    if (key === "aeration->sedimentation") {
      const out = new THREE.Vector3(fromPos.x, waterY, fromPos.z + fromScale.z / 2 + 0.14);
      const inn = new THREE.Vector3(toPos.x + toScale.x / 2 + 0.14, waterY, toPos.z);
      return [out, new THREE.Vector3(fromPos.x, waterY, inn.z), inn];
    }
    if (key === "sedimentation->scum-skimming") {
      const out = new THREE.Vector3(fromPos.x, waterY, fromPos.z - fromScale.z / 2 - 0.14);
      const inn = new THREE.Vector3(toPos.x, waterY, toPos.z + toScale.z / 2 + 0.14);
      return [out, new THREE.Vector3(out.x, waterY, (out.z + inn.z) / 2), new THREE.Vector3(inn.x, waterY, (out.z + inn.z) / 2), inn];
    }
    if (key === "scum-skimming->sand-filter") {
      const vesselR = tankWallExtent(to, "z") ?? toScale.z / 2;
      const out = new THREE.Vector3(fromPos.x + fromScale.x / 2 + 0.14, waterY, fromPos.z);
      const inn = new THREE.Vector3(toPos.x, tertiaryY, toPos.z - vesselR - 0.05);
      const rackX = inn.x;
      return [out, new THREE.Vector3(rackX, waterY, out.z), new THREE.Vector3(rackX, tertiaryY, out.z), inn];
    }
    if (key === "sand-filter->carbon-filter") {
      const fromR = tankWallExtent(from, "x") ?? fromScale.x / 2;
      const toR = tankWallExtent(to, "x") ?? toScale.x / 2;
      const out = new THREE.Vector3(fromPos.x - fromR - 0.05, tertiaryY, fromPos.z);
      const inn = new THREE.Vector3(toPos.x + toR + 0.05, tertiaryY, toPos.z);
      return [out, inn];
    }
    if (key === "carbon-filter->holding-tank") {
      const fromR = tankWallExtent(from, "x") ?? fromScale.x / 2;
      const toR = tankWallExtent(to, "x") ?? toScale.x / 2;
      const out = new THREE.Vector3(fromPos.x - fromR - 0.05, tertiaryY, fromPos.z);
      const inn = new THREE.Vector3(toPos.x + toR + 0.05, tertiaryY, toPos.z);
      return [out, new THREE.Vector3(inn.x, tertiaryY, out.z), inn];
    }
  }

  const start = new THREE.Vector3(fromPos.x, unitElevation(from.id) + (sludge ? 0.52 : 0.9), fromPos.z);
  const end = new THREE.Vector3(toPos.x, unitElevation(to.id) + (sludge ? 0.5 : 0.9), toPos.z);
  const mid = new THREE.Vector3((start.x + end.x) / 2, (start.y + end.y) / 2 + (sludge ? 0.02 : 0.05), (start.z + end.z) / 2);
  return [start, mid, end];
}

function SampleMarker`;

code = code.replace(regex, newFunction);
fs.writeFileSync('src/components/Plant3D.tsx', code);
