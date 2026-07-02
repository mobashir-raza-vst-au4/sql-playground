import dynamic from "next/dynamic";

// The whole playground is client-side (WASM engines, Monaco, localStorage).
const Playground = dynamic(() => import("@/components/Playground"), { ssr: false });

export default function Page() {
  return <Playground />;
}
