#!/usr/bin/env swift
import Foundation
import Vision
import ImageIO

// Small, dependency-free macOS Vision OCR helper used by extract_supplements.py.
// It deliberately emits JSON only; the caller adds source and verification
// metadata. OCR output is never presented as a verified transcription.

struct OCRLine: Codable {
    let text: String
    let confidence: Float
}

struct OCRResult: Codable {
    let status: String
    let lines: [OCRLine]
    let error: String?
}

func emit(_ result: OCRResult) -> Never {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(result), let text = String(data: data, encoding: .utf8) {
        print(text)
    } else {
        print("{\"status\":\"error\",\"lines\":[],\"error\":\"json_encode_failed\"}")
    }
    exit(result.status == "ok" ? 0 : 1)
}

guard CommandLine.arguments.count >= 2 else {
    emit(OCRResult(status: "error", lines: [], error: "missing_image_path"))
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard FileManager.default.fileExists(atPath: imageURL.path) else {
    emit(OCRResult(status: "error", lines: [], error: "image_not_found"))
}

let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        emit(OCRResult(status: "error", lines: [], error: error.localizedDescription))
    }
    let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
    var lines: [OCRLine] = []
    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { continue }
        lines.append(OCRLine(text: text, confidence: candidate.confidence))
    }
    emit(OCRResult(status: "ok", lines: lines, error: nil))
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.revision = VNRecognizeTextRequest.currentRevision

do {
    guard let imageSource = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        emit(OCRResult(status: "error", lines: [], error: "image_decode_failed"))
    }
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([request])
} catch {
    emit(OCRResult(status: "error", lines: [], error: error.localizedDescription))
}

// The request completion handler exits after emitting its result.
emit(OCRResult(status: "error", lines: [], error: "vision_request_did_not_complete"))
