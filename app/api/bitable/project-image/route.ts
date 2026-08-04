import { NextRequest, NextResponse } from "next/server";
import { downloadProjectAttachment, resolveBitableConfig } from "@/lib/bitable";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = await resolveBitableConfig(request.nextUrl.searchParams.get("appId"));
  if (!config) {
    return NextResponse.json({ message: "尚未配置飞书多维表格。" }, { status: 503 });
  }

  const recordId = request.nextUrl.searchParams.get("recordId")?.trim() || "";
  const fileToken = request.nextUrl.searchParams.get("fileToken")?.trim() || "";
  if (!/^rec[a-zA-Z0-9]+$/.test(recordId) || !/^[a-zA-Z0-9]+$/.test(fileToken)) {
    return NextResponse.json({ message: "项目背景图参数无效。" }, { status: 400 });
  }

  try {
    const attachment = await downloadProjectAttachment(config, recordId, fileToken);
    return new NextResponse(new Uint8Array(attachment.bytes), {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "Content-Type": attachment.contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取项目背景图失败";
    return NextResponse.json({ message }, { status: 502 });
  }
}
