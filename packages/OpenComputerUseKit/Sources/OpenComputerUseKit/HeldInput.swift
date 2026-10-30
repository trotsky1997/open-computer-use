import CoreGraphics
import Darwin
import Foundation

// A terminating stdio client must release input before the host's SIGKILL deadline.
final class HeldInput: @unchecked Sendable {
    static let shared = HeldInput()
    private let lock = NSLock()
    private var releases: [(Int, CGEvent, pid_t)] = []
    private var nextID = 0
    private var terminating = false
    private var termination: [DispatchSourceSignal] = []
    private let terminationQueue = DispatchQueue(label: "ocu.input-termination", qos: .userInteractive)
    private let emit: (CGEvent, pid_t) -> Void
    private let validate: () throws -> Void

    init(emit: @escaping (CGEvent, pid_t) -> Void, validate: @escaping () throws -> Void) {
        self.emit = emit
        self.validate = validate
    }

    private convenience init() {
        self.init(emit: { event, pid in event.postToPid(pid) }, validate: { try requireUsableComputerUseSession() })
        for number in [SIGTERM, SIGINT] {
            signal(number, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: number, queue: terminationQueue)
            source.setEventHandler { [self] in
                shutdown()
                Darwin.exit(128 + number)
            }
            let ready = DispatchSemaphore(value: 0)
            source.setRegistrationHandler { ready.signal() }
            termination.append(source)
            source.resume()
            ready.wait()
        }
    }

    func shutdown() {
        lock.lock(); defer { lock.unlock() }
        terminating = true
        for (_, event, pid) in releases.reversed() { post(event, pid: pid) }
        releases.removeAll()
    }

    func begin(down: CGEvent, up: CGEvent, pid: pid_t, move: CGEvent? = nil) throws -> Int {
        try check()
        lock.lock(); defer { lock.unlock() }
        guard !terminating else { throw ComputerUseError.message("Native input session ended") }
        nextID += 1
        releases.append((nextID, up, pid))
        if let move { post(move, pid: pid) }
        post(down, pid: pid)
        return nextID
    }

    func check() throws {
        lock.lock(); let ended = terminating; lock.unlock()
        if ended { throw ComputerUseError.message("Native input session ended") }
        try validate()
    }

    func wait(durationMs: Double) throws {
        let deadline = ProcessInfo.processInfo.systemUptime + durationMs / 1000
        while ProcessInfo.processInfo.systemUptime < deadline {
            try check()
            Thread.sleep(forTimeInterval: min(0.01, max(0, deadline - ProcessInfo.processInfo.systemUptime)))
        }
        try check()
    }

    func release(_ id: Int) {
        lock.lock(); defer { lock.unlock() }
        guard let index = releases.firstIndex(where: { $0.0 == id }) else { return }
        let (_, event, pid) = releases.remove(at: index)
        post(event, pid: pid)
    }

    private func post(_ event: CGEvent, pid: pid_t) {
        event.timestamp = DispatchTime.now().uptimeNanoseconds
        emit(event, pid)
    }
}

extension InputSimulation {
    static func clickTargetedHeld(at point: CGPoint, button: MouseButtonKind, clickCount: Int,
                                  key: String?, durationMs: Double?, pid: pid_t, input: HeldInput = .shared) throws {
        guard (1...3).contains(clickCount), durationMs.map({ $0.isFinite && $0 >= 0 }) ?? true else {
            throw ComputerUseError.invalidArguments("click requires click_count 1...3 and finite non-negative duration_ms")
        }
        try withTargetedHeldKeys(key, pid: pid, input: input) { source, flags in
            for count in 1...clickCount {
                guard let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: button.cgButton),
                      let down = CGEvent(mouseEventSource: source, mouseType: button.downEvent, mouseCursorPosition: point, mouseButton: button.cgButton),
                      let up = CGEvent(mouseEventSource: source, mouseType: button.upEvent, mouseCursorPosition: point, mouseButton: button.cgButton) else {
                    throw ComputerUseError.message("Failed to create held mouse events")
                }
                for event in [move, down, up] {
                    event.flags = flags
                    event.setIntegerValueField(.mouseEventClickState, value: Int64(count))
                }
                let token = try input.begin(down: down, up: up, pid: pid, move: move)
                do {
                    defer { input.release(token) }
                    try input.wait(durationMs: durationMs ?? 30)
                }
                Thread.sleep(forTimeInterval: 0.03)
            }
        }
    }

    static func pressKeyTargetedHeld(_ specification: String, durationMs: Double, pid: pid_t, input: HeldInput = .shared) throws {
        guard durationMs.isFinite && durationMs >= 0 else {
            throw ComputerUseError.invalidArguments("duration_ms must be finite and non-negative")
        }
        try withTargetedHeldKeys(specification, pid: pid, input: input) { _, _ in
            try input.wait(durationMs: durationMs)
        }
    }

    private static func withTargetedHeldKeys(_ key: String?, pid: pid_t, input: HeldInput,
                                             body: (CGEventSource, CGEventFlags) throws -> Void) throws {
        let keys = try key.map(KeyPressParser.heldKeys) ?? []
        guard let source = CGEventSource(stateID: .privateState) else {
            throw ComputerUseError.message("Failed to create held input source")
        }
        var held: [Int] = []
        defer { for token in held.reversed() { input.release(token) } }
        var flags: CGEventFlags = []
        for key in keys {
            guard let down = CGEvent(keyboardEventSource: source, virtualKey: key.keyCode, keyDown: true),
                  let up = CGEvent(keyboardEventSource: source, virtualKey: key.keyCode, keyDown: false) else {
                throw ComputerUseError.message("Failed to create held key events")
            }
            up.flags = flags
            flags.formUnion(key.flag)
            down.flags = flags
            if !key.flag.isEmpty { down.type = .flagsChanged; up.type = .flagsChanged }
            held.append(try input.begin(down: down, up: up, pid: pid))
        }
        try body(source, flags)
    }
}

public func shutdownOpenComputerUseHeldInput() {
    HeldInput.shared.shutdown()
}
