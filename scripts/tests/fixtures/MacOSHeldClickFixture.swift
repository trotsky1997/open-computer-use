import AppKit
import Foundation

final class EventView: NSView {
    var events: [[String: Any]] = []
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    func record(_ event: NSEvent, _ kind: String) {
        events.append(["kind":kind,"time":ProcessInfo.processInfo.systemUptime,"flags":event.modifierFlags.rawValue,"keyCode":event.cgEvent?.getIntegerValueField(.keyboardEventKeycode) ?? 0,"clicks":event.cgEvent?.getIntegerValueField(.mouseEventClickState) ?? 0])
        try? JSONSerialization.data(withJSONObject:events).write(to:URL(fileURLWithPath:CommandLine.arguments[1]),options:.atomic)
        setAccessibilityValue("Events \(events.count)")
    }
    override func mouseDown(with event:NSEvent){record(event,"down")}
    override func mouseUp(with event:NSEvent){record(event,"up")}
    override func draw(_ dirtyRect:NSRect) {
        NSColor.windowBackgroundColor.setFill();dirtyRect.fill()
        ("Held click target" as NSString).draw(at:NSPoint(x:50,y:70),withAttributes:[.font:NSFont.systemFont(ofSize:18)])
    }
}
final class Delegate:NSObject,NSApplicationDelegate {
    var window:NSWindow!
    var monitor:Any?
    func applicationDidFinishLaunching(_ n:Notification) {
        window=NSWindow(contentRect:NSRect(x:80,y:80,width:360,height:220),styleMask:[.titled],backing:.buffered,defer:false)
        window.title="OCUHeldClickFixture"
        let view=EventView(frame:NSRect(x:0,y:0,width:360,height:220))
        view.setAccessibilityElement(true);view.setAccessibilityRole(.button);view.setAccessibilityLabel("Held click target")
        monitor=NSEvent.addLocalMonitorForEvents(matching:[.flagsChanged,.keyDown,.keyUp]) { event in
            view.record(event,event.type == .flagsChanged ? "flags" : event.type == .keyDown ? "keyDown" : "keyUp")
            return event
        }
        window.contentView=view;window.makeFirstResponder(view);window.orderBack(nil)
        try? Data("[]".utf8).write(to:URL(fileURLWithPath:CommandLine.arguments[1]),options:.atomic)
    }
}
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate=Delegate();app.delegate=delegate
app.run()
