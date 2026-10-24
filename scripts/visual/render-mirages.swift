import Foundation
import AppKit
import PDFKit
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)!
for case let url as URL in files where url.pathExtension == "pdf" {
    guard let document = PDFDocument(url: url), let page = document.page(at: 0) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let size = NSSize(width: bounds.width * 96 / 72, height: bounds.height * 96 / 72)
    let img = page.thumbnail(of: size, for: .mediaBox)
    guard let tiff = img.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let data = bitmap.representation(using: .png, properties: [:]) else { continue }
    try data.write(to: url.deletingPathExtension().appendingPathExtension("png"))
}
