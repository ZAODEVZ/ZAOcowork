import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #041225 0%, #0c2340 100%)",
          borderRadius: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: "#3B82F6",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            ZC
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#60A5FA",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "3px",
            }}
          >
            WORKS
          </div>
        </div>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
