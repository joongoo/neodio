"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { COLLECTOR_PLATFORM_LABEL, type CollectorPlatform } from "@/lib/collectorAgent";
import { detectCollectorPlatform } from "@/lib/collectorClient";
import { GUIDE_OS_LABEL, GUIDE_OS_PLATFORMS, initialGuideOs, type GuideOs } from "@/lib/collectorInstallGuide";
import { cn } from "@/lib/cn";

// 수집기 설치 안내 — 운영체제별로 따로 쓴다. 감지된 OS 탭이 먼저 열리고, 다른 PC에 설치할 때를 위해 탭을 바꿀 수 있다.
export function CollectorInstallGuide({ outdated, downloadPlatforms }: { outdated: boolean; downloadPlatforms: CollectorPlatform[] }) {
  const [os, setOs] = useState<GuideOs>(() => initialGuideOs(undefined, typeof navigator === "undefined" ? "" : navigator.userAgent));
  useEffect(() => {
    detectCollectorPlatform().then((detected) => setOs(initialGuideOs(detected, navigator.userAgent)));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="운영체제" className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {(Object.keys(GUIDE_OS_LABEL) as GuideOs[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={os === key}
            onClick={() => setOs(key)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer",
              os === key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            {GUIDE_OS_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {GUIDE_OS_PLATFORMS[os].map((p) => (
          <DownloadButton key={p} platform={p} available={downloadPlatforms.includes(p)} />
        ))}
      </div>

      {os === "mac" ? <MacSteps outdated={outdated} /> : <WindowsSteps outdated={outdated} />}
    </div>
  );
}

function MacSteps({ outdated }: { outdated: boolean }) {
  return (
    <>
      <p className="text-xs text-neutral-500">
        칩 종류는 화면 왼쪽 위 Apple 메뉴 → <b>이 Mac에 관하여</b>에서 확인합니다. &quot;칩&quot;에 Apple M1·M2 같은 이름이 있으면 <b>Apple 실리콘</b>, &quot;프로세서&quot;에
        Intel이 있으면 <b>Intel</b>을 받으세요.
      </p>
      <ol className="flex list-decimal flex-col gap-1.5 rounded-md bg-neutral-50 py-3 pr-3 pl-8 text-xs text-neutral-600">
        <li>받은 zip 파일을 더블클릭해 압축을 풉니다.</li>
        <li>
          폴더 안의 <b>install.command</b>를 더블클릭합니다. 아래 창이 뜨면 <b>완료</b>를 누릅니다(휴지통으로 이동은 누르지 마세요).
          <GuideImage src="mac-1-blocked" alt="install.command 열지 않음 창" width={230} />
        </li>
        <li>
          <b>시스템 설정 → 개인정보 보호 및 보안</b>을 열고 <b>맨 아래로 스크롤</b>하면 나오는 &quot;install.command&quot; 항목에서 <b>그래도 열기</b>를 누릅니다.
          <GuideImage src="mac-2-settings" alt="개인정보 보호 및 보안의 그래도 열기 버튼" width={380} />
        </li>
        <li>
          다시 확인 창이 뜨면 <b>그래도 열기</b>를 누르고 Mac 암호를 입력합니다. 터미널이 열리며 설치가 진행됩니다.
          <GuideImage src="mac-3-confirm" alt="열겠습니까 확인 창" width={230} />
        </li>
        <li>터미널에 &quot;설치 완료&quot;가 보이면 아래 &quot;다시 확인&quot;을 누릅니다.</li>
      </ol>
      <Notes>
        <li>{outdated ? "이전 설치 위에 덮어쓰고 자동으로 다시 시작됩니다. 수집 결과와 설정은 그대로입니다." : "설치하면 로그인할 때마다 수집기가 자동으로 실행됩니다."}</li>
        <li>제거하려면 같은 폴더의 <b>uninstall.command</b>를 실행합니다.</li>
      </Notes>
    </>
  );
}

function WindowsSteps({ outdated }: { outdated: boolean }) {
  return (
    <>
      <ol className="flex list-decimal flex-col gap-1.5 rounded-md bg-neutral-50 py-3 pr-3 pl-8 text-xs text-neutral-600">
        <li>
          받은 zip 파일을 우클릭 → <b>모두 압축 풀기</b>로 폴더에 풉니다. zip 안에서 바로 실행하면 동작하지 않으니 꼭 풀어서 진행하세요.
        </li>
        <li>
          풀린 폴더 안의 <b>install.cmd</b>를 더블클릭합니다.
        </li>
        <li>
          파란 &quot;Windows의 PC 보호&quot; 창이 뜨면 <b>추가 정보</b> → <b>실행</b>을 누릅니다. 서명되지 않은 프로그램이라 처음 한 번 나옵니다.
        </li>
        <li>검은 창(명령 프롬프트)에 &quot;설치 완료&quot;가 보이면 아무 키나 눌러 닫습니다.</li>
        <li>아래 &quot;다시 확인&quot;을 누릅니다.</li>
      </ol>
      <Notes>
        <li>관리자 권한이 필요 없고, 이 PC 사용자 폴더(<code>%LOCALAPPDATA%\NeodioCollector</code>)에 설치됩니다.</li>
        <li>{outdated ? "이전 설치 위에 덮어쓰고 자동으로 다시 시작됩니다. 수집 결과와 설정은 그대로입니다." : "설치하면 Windows에 로그인할 때마다 창 없이 자동으로 실행됩니다."}</li>
        <li>제거하려면 같은 폴더의 <b>uninstall.cmd</b>를 실행합니다.</li>
      </Notes>
    </>
  );
}

function Notes({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-5 text-[11px] text-neutral-500">{children}</ul>;
}

function GuideImage({ src, alt, width }: { src: string; alt: string; width: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 안내용 고정 스크린샷, 최적화 불필요
    <img src={`/collector-guide/${src}.png`} alt={alt} width={width} className="mt-1.5 max-w-full rounded-md border border-neutral-200" />
  );
}

function DownloadButton({ platform, available }: { platform: CollectorPlatform; available: boolean }) {
  const className = "inline-flex h-10 items-center gap-1.5 rounded-md bg-slate-800 px-4 text-sm font-bold text-white hover:opacity-90";
  if (!available) {
    return (
      <span className={`${className} cursor-not-allowed opacity-40`} title="설치 파일 준비 중">
        <Download size={16} /> {COLLECTOR_PLATFORM_LABEL[platform]}
      </span>
    );
  }
  return (
    <a href={`/api/collector-download?platform=${platform}`} className={className}>
      <Download size={16} /> 수집기 받기 · {COLLECTOR_PLATFORM_LABEL[platform]}
    </a>
  );
}
