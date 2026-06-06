// swift-tools-version: 5.8
import PackageDescription

let package = Package(
    name: "MacDial",
    platforms: [.macOS(.v13)],
    targets: [
        // hidapi C 라이브러리 (mac HID 백엔드)
        .target(
            name: "hidapi",
            path: "Sources/hidapi",
            publicHeadersPath: "include",
            cSettings: [
                .headerSearchPath("include")
            ],
            linkerSettings: [
                .linkedFramework("CoreFoundation"),
                .linkedFramework("IOKit")
            ]
        ),
        // MacDial 메인 Swift 실행파일
        .executableTarget(
            name: "MacDial",
            dependencies: ["hidapi"],
            path: "Sources/MacDial",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("ApplicationServices")
            ]
        )
    ]
)
