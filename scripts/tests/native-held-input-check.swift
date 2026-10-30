import CoreGraphics
@testable import OpenComputerUseKit

func requireThrows(_ body: () throws -> Void) {
    do { try body(); preconditionFailure("Expected operation to throw") } catch {}
}

final class HeldInputChecks {
    private enum Canceled: Error { case client }

    func testHeldClickSequenceAndCancellationAlwaysReleaseInReverseOrder() throws {
        for canceled in [false, true] {
            var events: [(CGEventType, CGEventFlags, Int64, UInt64)] = []
            let input = HeldInput(emit: { event, _ in
                events.append((event.type, event.flags, event.getIntegerValueField(.mouseEventClickState), event.timestamp))
            }, validate: {
                if canceled && events.contains(where: { $0.0 == .leftMouseDown }) { throw Canceled.client }
            })
            let run = { try InputSimulation.clickTargetedHeld(at: .zero, button: .left, clickCount: 2, key: "shift+cmd", durationMs: 15, pid: -1, input: input) }
            if canceled { requireThrows { try run() } } else { try run() }
            let mouse = events.filter { $0.0 == .leftMouseDown || $0.0 == .leftMouseUp }
            requireEqual(mouse.count, canceled ? 2 : 4)
            requireEqual(mouse.first?.0, .leftMouseDown)
            requireEqual(mouse.last?.0, .leftMouseUp)
            for event in mouse { precondition(event.1.contains([.maskShift, .maskCommand])) }
            requireEqual(events.last?.0, .flagsChanged)
            requireEqual(events.last?.1, [])
            if !canceled {
                precondition(mouse[1].3 - mouse[0].3 >= 15_000_000)
                requireEqual(mouse.map(\.2), [1, 1, 2, 2])
            }
        }
    }

    func testOrdinaryHeldKeyIsReleasedBeforeModifiers() throws {
        var events: [CGEventType] = []
        let input = HeldInput(emit: { event, _ in events.append(event.type) }, validate: {})
        try InputSimulation.clickTargetedHeld(at: .zero, button: .left, clickCount: 1, key: "super+a", durationMs: 0, pid: -1, input: input)
        requireEqual(events, [.flagsChanged, .keyDown, .mouseMoved, .leftMouseDown, .leftMouseUp, .keyUp, .flagsChanged])
    }

    func testKeyDurationAndPartialCancellationReleaseChords() throws {
        for cancelAfter: CGEventType? in [nil, .flagsChanged, .keyDown] {
            var events: [(CGEventType, CGEventFlags, UInt64)] = []
            let input = HeldInput(emit: { event, _ in events.append((event.type, event.flags, event.timestamp)) }, validate: {
                if let cancelAfter, events.contains(where: { $0.0 == cancelAfter }) { throw Canceled.client }
            })
            let run = { try InputSimulation.pressKeyTargetedHeld("shift+a", durationMs: 15, pid: -1, input: input) }
            if cancelAfter != nil { requireThrows { try run() } } else { try run() }
            requireEqual(events.map { $0.0 }, cancelAfter == .flagsChanged ? [.flagsChanged, .flagsChanged] : [.flagsChanged, .keyDown, .keyUp, .flagsChanged])
            requireEqual(events.last?.1, [])
            if cancelAfter == nil { precondition(events[2].2 - events[1].2 >= 15_000_000) }
        }
        var events: [CGEventType] = []
        let input = HeldInput(emit: { event, _ in events.append(event.type) }, validate: {})
        try InputSimulation.pressKey("shift", pid: -1, input: input)
        requireEqual(events, [.flagsChanged, .flagsChanged])
        let before = events.count
        requireThrows { try InputSimulation.pressKeyTargetedHeld("a", durationMs: -.infinity, pid: -1, input: input) }
        requireEqual(events.count, before)
    }

    func testShutdownStopsNewInputAndReleasesEachHeldEventOnce() throws {
        var events: [CGEventType] = []
        let input = HeldInput(emit: { event, _ in events.append(event.type) }, validate: {})
        let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: .zero, mouseButton: .left)!
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: .zero, mouseButton: .left)!
        let token = try input.begin(down: down, up: up, pid: -1)
        input.shutdown(); input.release(token)
        requireThrows { _ = try input.begin(down: down, up: up, pid: -1) }
        requireEqual(events, [.leftMouseDown, .leftMouseUp])
    }

    func testKeyServiceRejectsDurationAndRoutesBeforeAppResolution() throws {
        let service = ComputerUseService()
        for (method, duration, expected): (KeyMethod, Double, String) in [(.auto, -.infinity, "duration_ms"), (.skyKey, 0, "key_method auto")] {
            do {
                _ = try service.pressKey(app: "NonexistentNoGUIFixture", key: "a", keyMethod: method, durationMs: duration)
                preconditionFailure("Expected invalid arguments before app resolution")
            } catch ComputerUseError.invalidArguments(let message) {
                precondition(message.contains(expected))
            }
        }
    }

    func testHeldKeyAndDurationValidationPrecedesInput() throws {
        requireEqual(try KeyPressParser.heldKeys("shift+cmd+shift").count, 2)
        requireEqual(try KeyPressParser.heldKeys("super+a").count, 2)
        for key in ["", "+a", "shift+", "unknown", "a+shift"] { requireThrows { _ = try KeyPressParser.heldKeys(key) } }
        for value: Any in [true, "12", -1, Double.infinity] { requireThrows { _ = try validatedInputDuration(value) } }
        for value: Any in [true, 1.5, 0, 4] { requireThrows { _ = try validatedClickCount(value) } }
        var events = 0
        let input = HeldInput(emit: { _, _ in events += 1 }, validate: {})
        requireThrows { try InputSimulation.clickTargetedHeld(at: .zero, button: .left, clickCount: 0, key: "shift", durationMs: 0, pid: -1, input: input) }
        requireEqual(events, 0)
    }

    func testUnprotectedCancellationDoesNotChangeCapturePolicyAndRestoresScope() throws {
        requireFalse(LockedUseActionScope.requiresScreenCaptureKit)
        requireThrows { try LockedUseActionScope.withCancellation({ throw Canceled.client }) {
            requireFalse(LockedUseActionScope.requiresScreenCaptureKit)
            try LockedUseActionScope.validate()
        } }
        requireFalse(LockedUseActionScope.requiresScreenCaptureKit)
        try LockedUseActionScope.withCancellation({}) {
            try LockedUseActionScope.withValidator({}) {
                precondition(LockedUseActionScope.requiresScreenCaptureKit)
                try LockedUseActionScope.validate()
            }
        }
        requireFalse(LockedUseActionScope.requiresScreenCaptureKit)
    }
}

func requireEqual<T: Equatable>(_ actual: T, _ expected: T) { precondition(actual == expected) }
func requireFalse(_ value: Bool) { precondition(!value) }
let checks = HeldInputChecks()
try checks.testHeldClickSequenceAndCancellationAlwaysReleaseInReverseOrder()
try checks.testOrdinaryHeldKeyIsReleasedBeforeModifiers()
try checks.testKeyDurationAndPartialCancellationReleaseChords()
try checks.testShutdownStopsNewInputAndReleasesEachHeldEventOnce()
try checks.testKeyServiceRejectsDurationAndRoutesBeforeAppResolution()
try checks.testHeldKeyAndDurationValidationPrecedesInput()
try checks.testUnprotectedCancellationDoesNotChangeCapturePolicyAndRestoresScope()
print("PASS held input flags/count/duration, reverse release on cancel/shutdown, validation and cancellation scope; no GUI events emitted")
