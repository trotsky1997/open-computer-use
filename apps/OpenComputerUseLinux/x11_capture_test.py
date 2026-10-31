import struct
import types
import unittest
from unittest import mock
import zlib
import x11_capture as capture


class ImageTests(unittest.TestCase):
    def test_shape_png_clips_unions_and_zeros_rgb_without_losing_alpha(self):
        def pixels(raw, alpha, shape):
            data = capture.png(raw, 3, 2, 12, 0, (0xff0000, 0xff00, 0xff), alpha, shape)
            self.assertEqual(data[25], 6)
            length = struct.unpack_from('!I', data, 33)[0]
            rows = zlib.decompress(data[41:41 + length])
            return rows[1:13] + rows[14:26]
        raw = bytes([0, 0, 255, 0]) * 6
        red, clear = bytes([255, 0, 0, 255]), bytes(4)
        self.assertEqual(pixels(raw, False, [(-1, 0, 2, 1), (1, 1, 3, 1), (1, 1, 1, 1)]), red + clear * 3 + red * 2)
        self.assertEqual(pixels(raw, False, []), bytes(24))
        self.assertEqual(pixels(bytes([0, 0, 128, 128]) * 6, True, [(0, 0, 1, 1)]), bytes([255, 0, 0, 128]) + bytes(20))
        with self.assertRaisesRegex(RuntimeError, 'rectangle budget'):
            pixels(raw, False, [(0, 0, 1, 1)] * 4097)
        with self.assertRaisesRegex(RuntimeError, 'Invalid X11 shape'):
            pixels(raw, False, [(0, 0, 0, 1)])
        with self.assertRaisesRegex(RuntimeError, 'pixel budget'):
            capture.png(b'', 4000, 4000, 16000, 0, (0xff0000, 0xff00, 0xff), False, [(0, 0, 4000, 4000)] * 2)

    def test_png_unpremultiplies_alpha_in_both_byte_orders(self):
        for order, raw in [(0, bytes([0, 0, 128, 128, 10, 20, 30, 0])), (1, bytes([128, 128, 0, 0, 0, 30, 20, 10]))]:
            data = capture.png(raw, 2, 1, 8, order, (0xff0000, 0xff00, 0xff), True)
            self.assertEqual(data[25], 6)
            length = struct.unpack_from('!I', data, 33)[0]
            self.assertEqual(zlib.decompress(data[41:41 + length]), bytes([0, 255, 0, 0, 128, 0, 0, 0, 0]))

    def test_png_orders_black_pixels_and_crc(self):
        for order, pixels in [(0, b'\0\0\xff\0\xff\0\0\0'), (1, b'\0\xff\0\0\0\0\0\xff')]:
            data = capture.png(pixels, 2, 1, 8, order, (0xff0000, 0xff00, 0xff))
            position, compressed = 8, b''
            while position < len(data):
                length = struct.unpack_from('!I', data, position)[0]
                kind, payload = data[position + 4:position + 8], data[position + 8:position + 8 + length]
                self.assertEqual(struct.unpack_from('!I', data, position + 8 + length)[0], zlib.crc32(kind + payload))
                if kind == b'IDAT':
                    compressed += payload
                position += length + 12
            self.assertEqual(zlib.decompress(compressed), b'\0\xff\0\0\0\0\xff')
        self.assertTrue(capture.png(bytes(8), 2, 1, 8, 0, (0xff0000, 0xff00, 0xff)).startswith(b'\x89PNG'))
        with self.assertRaisesRegex(RuntimeError, 'pixel layout'):
            capture.png(bytes(8), 2, 1, 8, 0, (0, 0, 0))

    def client(self):
        client = object.__new__(capture.X11)
        client.display, client.root, client.error = 1, 1, False
        client.lib, client.shape = mock.Mock(), mock.Mock()
        client.lib.XDefaultScreen.return_value = 0
        client.lib.XGrabPointer.return_value = 0
        client.lib.XInternAtom.return_value = 0
        client.lib.XGetInputFocus.side_effect = lambda _d, focus, _r: setattr(focus._obj, 'value', 2)
        client.shape.XShapeQueryExtents.return_value = 1
        client.pid = lambda _window: 42
        client.tree = lambda window: (1, []) if window == 2 else (0, [2, 3])
        client.rectangle = lambda window: (0, 0, 2, 1) if window == 2 else (1, 0, 2, 1)
        client.attributes = lambda window: types.SimpleNamespace(map_state=2, width=100, height=100, window_class=1, depth=24)
        return client

    def test_occlusion_and_pid_failure_release_server_without_image_read(self):
        for wrong_pid in (False, True):
            client = self.client()
            with self.assertRaisesRegex(RuntimeError, 'PID/frame' if wrong_pid else 'occluded'):
                client.read(99 if wrong_pid else 42, (0, 0, 2, 1))
            client.lib.XUngrabServer.assert_called_once_with(1)
            client.lib.XGetImage.assert_not_called()

    def test_compositor_and_shaped_frame_are_rejected_before_pixels(self):
        client = self.client()
        client.lib.XInternAtom.return_value = 7
        client.lib.XGetSelectionOwner.return_value = 9
        with self.assertRaisesRegex(RuntimeError, 'Composited'):
            client.read(42, (0, 0, 2, 1))
        client.lib.XUngrabServer.assert_called_once()
        client.lib.XGetImage.assert_not_called()

        client = self.client()
        def shaped(_d, _w, bounding, *_args):
            bounding._obj.value = 1
            return 1
        client.shape.XShapeQueryExtents.side_effect = shaped
        with self.assertRaisesRegex(RuntimeError, 'Shaped'):
            client.read(42, (0, 0, 2, 1))
        client.lib.XUngrabServer.assert_called_once()
        client.lib.XGetImage.assert_not_called()

    def test_compositor_and_argb_depth_do_not_bypass_input_frame_verification(self):
        client = self.client()
        client.lib.XInternAtom.return_value = 7
        client.lib.XGetSelectionOwner.return_value = 9
        client.tree = lambda window: (1, []) if window == 2 else (0, [2])
        client.attributes = lambda window: types.SimpleNamespace(map_state=2, width=100, height=100, window_class=1, depth=24 if window == 1 else 32)
        self.assertEqual(client.verify_frame(42, (0, 0, 2, 1), float('inf')), 2)
        with self.assertRaisesRegex(RuntimeError, 'PID/frame'):
            client.verify_frame(99, (0, 0, 2, 1), float('inf'))
        client.tree = lambda window: (1, []) if window == 2 else (0, [2, 3])
        with self.assertRaisesRegex(RuntimeError, 'occluded'):
            client.verify_frame(42, (0, 0, 2, 1), float('inf'))

    def test_child_input_region_is_checked_beneath_a_wm_frame(self):
        client = self.client()
        client.lib.XGetInputFocus.side_effect = lambda _d, focus, _r: setattr(focus._obj, 'value', 3)
        client.tree = lambda window: (0, [2]) if window == 1 else (1, [3]) if window == 2 else (2, [])
        client.pid = lambda window: 42 if window == 3 else None
        client.rectangle = lambda _window: (0, 0, 3, 1)
        client.capture_shape = mock.Mock(side_effect=lambda window, _attrs, _deadline, kind=0: None if kind == 0 else [(0, 0, 1 if window == 3 else 3, 1)])
        self.assertEqual(client.verify_frame(42, (0, 0, 3, 1), float('inf'), input_points=((0, 0),)), 2)
        with self.assertRaisesRegex(RuntimeError, 'input region'):
            client.verify_frame(42, (0, 0, 3, 1), float('inf'), input_points=((1, 0),))

    def test_drag_path_hole_is_rejected_before_motion_or_button_press(self):
        client = self.client()
        client.tree = lambda window: (0, [2]) if window == 1 else (1, [])
        client.rectangle = lambda _window: (0, 0, 3, 1)
        client.capture_shape = mock.Mock(return_value=[(0, 0, 1, 1), (2, 0, 1, 1)])
        xtest = mock.Mock()
        xtest.XTestQueryExtension.return_value = 1
        with mock.patch.object(capture.C, 'CDLL', return_value=xtest):
            with self.assertRaisesRegex(RuntimeError, 'drag path.*input region'):
                client.drag(42, (0, 0, 3, 1), (0, 0), (2, 0))
        xtest.XTestFakeMotionEvent.assert_not_called()
        xtest.XTestFakeButtonEvent.assert_not_called()
        client.lib.XUngrabServer.assert_called_once()

    def test_remote_display_and_mixed_depth_fail_before_pixel_read(self):
        with mock.patch.dict(capture.os.environ, {"DISPLAY": "localhost:10.0"}), mock.patch.object(capture, "X11") as native:
            with self.assertRaisesRegex(RuntimeError, 'local X11'):
                capture.capture_visible_window(42, {"x": 0, "y": 0, "width": 2, "height": 1})
            native.assert_not_called()
        client = self.client()
        client.attributes = lambda window: types.SimpleNamespace(map_state=2, width=100, height=100, window_class=1, depth=24 if window == 1 else 32)
        with self.assertRaisesRegex(RuntimeError, 'Mixed-depth'):
            client.read(42, (0, 0, 2, 1))
        client.lib.XGetImage.assert_not_called()
        client.lib.XUngrabServer.assert_called_once()

    def test_native_image_is_freed_and_server_released(self):
        client = self.client()
        client.tree = lambda window: (1, []) if window == 2 else (0, [2])
        pixels = capture.C.create_string_buffer(bytes(8))
        image = capture.Image(width=2, height=1, data=capture.C.cast(pixels, capture.C.c_void_p), bytes_per_line=8, bits_per_pixel=32, red_mask=0xff0000, green_mask=0xff00, blue_mask=0xff)
        pointer = capture.C.pointer(image)
        client.lib.XGetImage.return_value = pointer
        self.assertTrue(client.read(42, (0, 0, 2, 1)).startswith(b'\x89PNG'))
        client.lib.XDestroyImage.assert_called_once_with(pointer)
        client.lib.XUngrabServer.assert_called_once()

    def test_composite_frame_rejects_wrong_pid_and_duplicate_geometry(self):
        client = self.client()
        self.assertEqual(client.composite_frame(42, (0, 0, 2, 1), float('inf')), 2)
        with self.assertRaisesRegex(RuntimeError, 'PID/geometry'):
            client.composite_frame(99, (0, 0, 2, 1), float('inf'))
        client.tree = lambda window: (0, [2, 3]) if window == 1 else (1, [])
        client.rectangle = lambda window: (0, 0, 2, 1)
        with self.assertRaisesRegex(RuntimeError, 'ambiguous'):
            client.composite_frame(42, (0, 0, 2, 1), float('inf'))

    def test_composite_frame_accepts_mixed_depth_but_rejects_foreign_pid(self):
        client = self.client()
        client.tree = lambda window: (0, [2]) if window == 1 else (1, [3]) if window == 2 else (2, [])
        client.attributes = lambda window: types.SimpleNamespace(map_state=2, window_class=1, depth=32 if window == 2 else 24)
        client.pid = lambda window: 42 if window == 2 else None
        self.assertEqual(client.composite_frame(42, (0, 0, 2, 1), float('inf')), 2)
        client.pid = lambda window: 42 if window == 2 else 99
        with self.assertRaisesRegex(RuntimeError, 'PID/geometry'):
            client.composite_frame(42, (0, 0, 2, 1), float('inf'))

    def test_native_shape_border_translation_empty_region_and_cleanup(self):
        client = self.client()
        def shaped(_display, _window, bounding, *_args):
            bounding._obj.value = 1
            return 1
        client.shape.XShapeQueryExtents.side_effect = shaped
        rectangles = (capture.Rectangle * 2)(capture.Rectangle(-2, -1, 3, 2), capture.Rectangle(3, 2, 5, 4))
        def region(_display, _window, kind, count, order):
            self.assertEqual(kind, 0)
            count._obj.value, order._obj.value = 2, 3
            return rectangles
        client.shape.XShapeGetRectangles.side_effect = region
        self.assertEqual(client.capture_shape(2, types.SimpleNamespace(border_width=2), float('inf')), [(0, 1, 3, 2), (5, 4, 5, 4)])
        client.lib.XFree.assert_called_once_with(rectangles)
        client.lib.XFree.reset_mock()
        rectangles[0].width = 0
        with self.assertRaisesRegex(RuntimeError, 'Invalid X11 shape rectangle'):
            client.capture_shape(2, types.SimpleNamespace(border_width=2), float('inf'))
        client.lib.XFree.assert_called_once_with(rectangles)
        client.lib.XFree.reset_mock()
        client.shape.XShapeGetRectangles.side_effect = lambda _d, _w, _kind, count, order: (setattr(count._obj, 'value', 4097) or rectangles)
        with self.assertRaisesRegex(RuntimeError, 'over-budget'):
            client.capture_shape(2, types.SimpleNamespace(border_width=2), float('inf'))
        client.lib.XFree.assert_called_once_with(rectangles)
        client.shape.XShapeGetRectangles.side_effect = None
        client.shape.XShapeGetRectangles.return_value = capture.C.POINTER(capture.Rectangle)()
        self.assertEqual(client.capture_shape(2, types.SimpleNamespace(border_width=2), float('inf')), [])

    def test_composite_pixmap_and_image_are_freed_on_success_and_format_failure(self):
        for valid in (True, False):
            client = self.client()
            client.lib.XInternAtom.return_value = 7
            client.lib.XGetSelectionOwner.return_value = 9
            client.composite_frame = mock.Mock(return_value=2)
            client.attributes = lambda _window: types.SimpleNamespace(depth=24, visual=1)
            composite, render = mock.Mock(), mock.Mock()
            def version(_display, major, minor):
                minor._obj.value = 2
                return 1
            composite.XCompositeQueryVersion.side_effect = version
            composite.XCompositeNameWindowPixmap.return_value = 12
            format_ = capture.PictureFormat(type=1, depth=24, direct=capture.DirectFormat(red=16, redMask=255, green=8, greenMask=255, blueMask=255))
            render.XRenderFindVisualFormat.return_value = capture.C.pointer(format_)
            def geometry(_display, _pixmap, _root, _x, _y, width, height, _border, depth):
                width._obj.value, height._obj.value, depth._obj.value = 2, 1, 24
                return 1
            client.lib.XGetGeometry.side_effect = geometry
            pixels = capture.C.create_string_buffer(bytes(8))
            image = capture.Image(width=2, height=1, format=2, depth=24, data=capture.C.cast(pixels, capture.C.c_void_p), bytes_per_line=8, bits_per_pixel=32 if valid else 16)
            pointer = capture.C.pointer(image)
            client.lib.XGetImage.return_value = pointer
            with mock.patch.object(capture.C, 'CDLL', side_effect=[composite, render]):
                if valid:
                    self.assertTrue(client.read_composite(42, (0, 0, 2, 1)).startswith(b'\x89PNG'))
                else:
                    with self.assertRaisesRegex(RuntimeError, 'image format'):
                        client.read_composite(42, (0, 0, 2, 1))
            client.lib.XDestroyImage.assert_called_once_with(pointer)
            client.lib.XFreePixmap.assert_called_once_with(1, 12)
            client.lib.XUngrabServer.assert_called_once_with(1)


    def test_pointer_failure_pairs_release_and_never_repeats_press(self):
        client = self.client()
        client.verify_frame = mock.Mock(return_value=2)
        client.pointer = mock.Mock(side_effect=[(1, 0, 0, 0), (2, 1, 0, 0), (2, 1, 0, 0), (2, 1, 0, 0)])
        xtest = mock.Mock()
        xtest.XTestQueryExtension.return_value = 1
        xtest.XTestFakeMotionEvent.return_value = 1
        xtest.XTestFakeButtonEvent.side_effect = [0, 1]
        with mock.patch.object(capture.C, 'CDLL', return_value=xtest):
            with self.assertRaisesRegex(RuntimeError, 'press failed'):
                client.click(42, (0, 0, 2, 1), (1, 0), 'left', 3)
        self.assertEqual(xtest.XTestFakeButtonEvent.call_args_list, [mock.call(1, 1, 1, 0), mock.call(1, 1, 0, 0)])
        client.lib.XUngrabServer.assert_called_once()

    def test_held_button_and_wrong_pointer_target_stop_before_press(self):
        for state in (0x100, 0):
            client = self.client()
            client.verify_frame = mock.Mock(return_value=2)
            client.pointer = mock.Mock(side_effect=[(1, 0, 0, state), (99, 1, 0, 0)])
            xtest = mock.Mock()
            with mock.patch.object(capture.C, 'CDLL', return_value=xtest):
                with self.assertRaises(RuntimeError):
                    client.click(42, (0, 0, 2, 1), (1, 0), 'left', 1)
            xtest.XTestFakeButtonEvent.assert_not_called()
            if state:
                xtest.XTestFakeMotionEvent.assert_not_called()
            client.lib.XUngrabServer.assert_called_once()

    def test_input_is_delivered_after_server_release_and_allows_new_popup(self):
        client = self.client()
        client.verify_frame = mock.Mock(return_value=2)
        client.pointer = mock.Mock(side_effect=[(1, 0, 0, 0), (2, 1, 0, 0), (2, 1, 0, 0), (99, 1, 0, 0), (99, 1, 0, 0)])
        xtest = mock.Mock()
        def button(*_args):
            client.lib.XUngrabServer.assert_called_once()
            return 1
        xtest.XTestFakeButtonEvent.side_effect = button
        with mock.patch.object(capture.C, 'CDLL', return_value=xtest):
            client.click(42, (0, 0, 2, 1), (1, 0), 'right', 1)
        self.assertEqual(xtest.XTestFakeButtonEvent.call_count, 2)

    def test_existing_pointer_grab_stops_before_motion(self):
        client = self.client()
        client.verify_frame = mock.Mock(return_value=2)
        client.pointer = mock.Mock(return_value=(1, 0, 0, 0))
        client.lib.XGrabPointer.return_value = 1
        xtest = mock.Mock()
        with mock.patch.object(capture.C, 'CDLL', return_value=xtest):
            with self.assertRaisesRegex(RuntimeError, 'grab unavailable'):
                client.click(42, (0, 0, 2, 1), (1, 0), 'left', 1)
        xtest.XTestFakeMotionEvent.assert_not_called()
        xtest.XTestFakeButtonEvent.assert_not_called()
        client.lib.XUngrabPointer.assert_not_called()
        client.lib.XUngrabServer.assert_called_once()

    def test_lock_modifier_is_allowed_but_action_modifier_is_rejected(self):
        client = self.client()
        keys = (capture.C.c_ubyte * 8)(0, 0, 66, 0, 0, 0, 0, 0)
        mapping = capture.ModifierMap(max_keypermod=1, modifiermap=keys)
        client.lib.XGetModifierMapping.return_value = capture.C.pointer(mapping)
        client.lib.XKeycodeToKeysym.return_value = 0xffe5
        client.require_neutral(4)
        client.lib.XKeycodeToKeysym.return_value = 0xffe9
        with self.assertRaisesRegex(RuntimeError, 'modifier is already held'):
            client.require_neutral(4)
        self.assertEqual(client.lib.XFreeModifiermap.call_count, 2)

    def test_release_wait_observes_clear_or_times_out_without_new_input(self):
        client = self.client()
        client.pointer = mock.Mock(side_effect=[(2, 1, 0, 0x400), (99, 1, 0, 0)])
        with mock.patch.object(capture.time, 'sleep') as sleep:
            client.wait_button_release(3)
        sleep.assert_called_once()
        self.assertEqual(client.lib.mock_calls, [])
        client.pointer = mock.Mock(return_value=(2, 1, 0, 0x400))
        with mock.patch.object(capture.time, 'monotonic', side_effect=[0, 0.3]):
            with self.assertRaisesRegex(RuntimeError, 'release remains unconfirmed'):
                client.wait_button_release(3)
        self.assertEqual(client.lib.mock_calls, [])


class CancellationTests(unittest.TestCase):
    client = ImageTests.client
    def test_cancel_during_press_releases_and_stops_remaining_clicks(self):
        import native_cancel as cancel
        client = self.client()
        client.verify_frame = mock.Mock(return_value=2)
        client.pointer = mock.Mock(side_effect=[(1, 0, 0, 0), (2, 1, 0, 0), (2, 1, 0, 0), (2, 1, 0, 0)])
        xtest = mock.Mock()
        def button(_display, _code, down, _delay):
            if down:
                cancel.handle_signal(None, None)
            return 1
        xtest.XTestFakeButtonEvent.side_effect = button
        with mock.patch.object(cancel, "_requested", False), mock.patch.object(capture.C, 'CDLL', return_value=xtest):
            with self.assertRaises(cancel.OperationCancelled):
                client.click(42, (0, 0, 2, 1), (1, 0), 'left', 3)
        self.assertEqual(xtest.XTestFakeButtonEvent.call_args_list, [mock.call(1, 1, 1, 0), mock.call(1, 1, 0, 0)])
        client.lib.XSync.assert_called()


class DragTests(unittest.TestCase):
    client = ImageTests.client

    def prepared(self):
        client = self.client()
        xtest = mock.Mock()
        client.prepare_pointer = mock.Mock(return_value=(xtest, 2))
        client.verify_frame = mock.Mock(return_value=2)
        client.require_neutral = mock.Mock()
        return client, xtest

    def test_drag_moves_under_one_press_then_releases(self):
        client, xtest = self.prepared()
        positions = []
        for step in range(1, 13):
            positions.append((2, step - 1, 0, 0x100))
            if step == 1:
                positions.append((2, 0, 0, 0x100))
            positions.append((2, step, 0, 0x100))
        client.pointer = mock.Mock(side_effect=positions + [(2, 12, 0, 0), (2, 12, 0, 0)])
        with mock.patch.object(capture.time, 'sleep'):
            client.drag(42, (0, 0, 13, 1), (0, 0), (12, 0))
        self.assertEqual(xtest.XTestFakeButtonEvent.call_args_list, [mock.call(1, 1, 1, 0), mock.call(1, 1, 0, 0)])
        self.assertEqual(xtest.XTestFakeMotionEvent.call_args_list, [mock.call(1, 0, x, 0, 0) for x in range(1, 13)])
        self.assertEqual(client.lib.XUngrabServer.call_count, 12)

    def test_drag_cancellation_and_backend_failure_release_without_more_motion(self):
        import native_cancel as cancel
        for failure in ('cancel', 'frame', 'press', 'motion', 'pointer', 'moved'):
            with self.subTest(failure=failure), mock.patch.object(cancel, '_requested', False):
                client, xtest = self.prepared()
                client.pointer = mock.Mock(return_value=(2, 0, 0, 0x100))
                if failure == 'frame':
                    client.verify_frame.side_effect = RuntimeError('frame changed')
                elif failure == 'press':
                    xtest.XTestFakeButtonEvent.side_effect = [0, 1]
                elif failure == 'motion':
                    xtest.XTestFakeMotionEvent.return_value = 0
                elif failure == 'pointer':
                    client.pointer.return_value = (99, 0, 0, 0x100)
                elif failure == 'moved':
                    client.pointer.return_value = (2, 5, 0, 0x100)
                else:
                    def signal_on_press(_display, _code, down, _delay):
                        if down:
                            cancel.handle_signal(None, None)
                        return 1
                    xtest.XTestFakeButtonEvent.side_effect = signal_on_press
                with self.assertRaises((RuntimeError, cancel.OperationCancelled)):
                    client.drag(42, (0, 0, 13, 1), (0, 0), (12, 0))
                self.assertEqual(xtest.XTestFakeButtonEvent.call_args_list, [mock.call(1, 1, 1, 0), mock.call(1, 1, 0, 0)])
                self.assertLessEqual(xtest.XTestFakeMotionEvent.call_count, 1)

    def test_invalid_endpoints_never_prepare_pointer(self):
        for point in ((13, 0), (-1, 0), (1.5, 0), (float('nan'), 0), (True, 0)):
            client, xtest = self.prepared()
            with self.assertRaises(RuntimeError):
                client.drag(42, (0, 0, 13, 1), (0, 0), point)
            client.prepare_pointer.assert_not_called()
            xtest.XTestFakeButtonEvent.assert_not_called()


class HeldClickTests(unittest.TestCase):
    client = ImageTests.client

    def prepared(self):
        client = self.client()
        xtest = mock.Mock()
        client.prepare_pointer = mock.Mock(return_value=(xtest, 2))
        client.resolve_held_keys = mock.Mock(return_value=([50, 37, 38], 5))
        client.keyboard_state = mock.Mock(return_value=set())
        client.pointer = mock.Mock(return_value=(2, 1, 0, 0))
        client.check_held_click = mock.Mock()
        events = []
        xtest.XTestFakeKeyEvent.side_effect = lambda _display, code, down, _delay: events.append(('key', code, down)) or 1
        xtest.XTestFakeButtonEvent.side_effect = lambda _display, code, down, _delay: events.append(('button', code, down)) or 1
        return client, xtest, events

    def test_chord_wraps_sequence_and_releases_in_reverse(self):
        client, xtest, events = self.prepared()
        client.click(42, (0, 0, 2, 1), (1, 0), 'left', 2, [1, 2, 3], 0)
        self.assertEqual(events, [('key', 50, 1), ('key', 37, 1), ('key', 38, 1), ('button', 1, 1), ('button', 1, 0), ('button', 1, 1), ('button', 1, 0), ('key', 38, 0), ('key', 37, 0), ('key', 50, 0)])
        self.assertEqual(client.check_held_click.call_count, 2)

    def test_cancelled_mouse_and_failed_key_release_attempt_all_owned_releases(self):
        import native_cancel as cancel
        client, xtest, events = self.prepared()
        def button(_display, code, down, _delay):
            events.append(('button', code, down))
            if down:
                cancel.handle_signal(None, None)
            return 1
        xtest.XTestFakeButtonEvent.side_effect = button
        with mock.patch.object(cancel, '_requested', False), self.assertRaises(cancel.OperationCancelled):
            client.click(42, (0, 0, 2, 1), (1, 0), 'left', 3, [1], 100)
        self.assertEqual(events[-4:], [('button', 1, 0), ('key', 38, 0), ('key', 37, 0), ('key', 50, 0)])
        self.assertEqual(xtest.XTestFakeButtonEvent.call_count, 2)
        client, xtest, events = self.prepared()
        def key(_display, code, down, _delay):
            events.append(('key', code, down))
            if code == 38 and not down:
                raise RuntimeError('release backend failure')
            return 1
        xtest.XTestFakeKeyEvent.side_effect = key
        with self.assertRaisesRegex(RuntimeError, 'key release failed'):
            client.click(42, (0, 0, 2, 1), (1, 0), 'left', 1, [1], 0)
        self.assertEqual(events[-3:], [('key', 38, 0), ('key', 37, 0), ('key', 50, 0)])

    def test_preexisting_key_stops_before_pointer_or_input(self):
        client, xtest, _events = self.prepared()
        client.keyboard_state.return_value = {50}
        with self.assertRaisesRegex(RuntimeError, 'already held'):
            client.click(42, (0, 0, 2, 1), (1, 0), 'left', 1, [1], 0)
        client.prepare_pointer.assert_not_called()
        xtest.XTestFakeKeyEvent.assert_not_called()

    def test_native_mapping_and_keyboard_bits(self):
        client = self.client()
        mapping = capture.ModifierMap(max_keypermod=1, modifiermap=(capture.C.c_ubyte * 8)(50, 0, 37, 0, 0, 0, 0, 0))
        client.lib.XGetModifierMapping.return_value = capture.C.pointer(mapping)
        values = {0xffe1: 50, 0xffe3: 37, 97: 38}
        client.lib.XKeysymToKeycode.side_effect = lambda _display, symbol: values.get(symbol, 0)
        client.lib.XKeycodeToKeysym.side_effect = lambda _display, code, _index: next(symbol for symbol, value in values.items() if value == code)
        self.assertEqual(client.resolve_held_keys([0xffe1, 0xffe3, 97, 97]), ([50, 37, 38], 5))
        for symbol in (0xffe5, 0xff7f, 0xff14, 99999):
            with self.assertRaises(RuntimeError):
                client.resolve_held_keys([symbol])
        def query(_display, vector):
            vector[6] = 4
            return 1
        client.lib.XQueryKeymap.side_effect = query
        self.assertEqual(client.keyboard_state(), {50})


class TimedKeyTests(unittest.TestCase):
    client = ImageTests.client

    def prepared(self):
        client = self.client()
        xtest, events, pressed = mock.Mock(), [], set()
        client.xtest = mock.Mock(return_value=xtest)
        client.resolve_held_keys = mock.Mock(return_value=([50, 37, 38], 5))
        client.verify_frame = mock.Mock(return_value=2)
        client.keyboard_state = lambda: set(pressed)
        client.pointer = lambda: (99, 900, 500, 5 if pressed else 0)
        client.require_neutral = mock.Mock()
        def key(_display, code, down, _delay):
            events.append((code, down))
            if down:
                pressed.add(code)
            else:
                pressed.discard(code)
            return 1
        xtest.XTestFakeKeyEvent.side_effect = key
        return client, xtest, events

    def test_zero_duration_chord_releases_without_pointer_events(self):
        client, xtest, events = self.prepared()
        client.press_key(42, (0, 0, 400, 300), [1], 0)
        self.assertEqual(events, [(50, 1), (37, 1), (38, 1), (38, 0), (37, 0), (50, 0)])
        xtest.XTestFakeMotionEvent.assert_not_called()
        xtest.XTestFakeButtonEvent.assert_not_called()

    def test_cancellation_and_frame_failure_release_whole_chord(self):
        import native_cancel as cancel
        for failure in ('cancel', 'frame'):
            with self.subTest(failure=failure), mock.patch.object(cancel, '_requested', False):
                client, xtest, events = self.prepared()
                if failure == 'frame':
                    client.verify_frame.side_effect = [2, RuntimeError('frame changed')]
                with mock.patch.object(capture.time, 'sleep', side_effect=lambda _duration: cancel.handle_signal(None, None)):
                    with self.assertRaises((RuntimeError, cancel.OperationCancelled)):
                        client.press_key(42, (0, 0, 400, 300), [1], 100)
                self.assertEqual(events[-3:], [(38, 0), (37, 0), (50, 0)])
                xtest.XTestFakeMotionEvent.assert_not_called()

    def test_partial_key_press_failure_releases_only_attempted_keys(self):
        client, xtest, _events = self.prepared()
        xtest.XTestFakeKeyEvent.side_effect = [1, 0, 1, 1]
        with self.assertRaisesRegex(RuntimeError, 'key press failed'):
            client.press_key(42, (0, 0, 400, 300), [1], 0)
        self.assertEqual(xtest.XTestFakeKeyEvent.call_args_list, [mock.call(1, 50, 1, 0), mock.call(1, 37, 1, 0), mock.call(1, 37, 0, 0), mock.call(1, 50, 0, 0)])


class ScrollTests(unittest.TestCase):
    client = ImageTests.client

    def prepared(self):
        client, xtest = self.client(), mock.Mock()
        client.prepare_pointer = mock.Mock(return_value=(xtest, 2))
        client.verify_frame = mock.Mock(return_value=2)
        client.pointer = mock.Mock(return_value=(2, 1, 0, 0))
        client.require_neutral = mock.Mock()
        return client, xtest

    def test_four_directions_and_fractional_wheel_counts(self):
        for direction, code in [('up', 4), ('down', 5), ('left', 6), ('right', 7)]:
            client, xtest = self.prepared()
            with mock.patch.object(capture.time, 'sleep'):
                client.scroll(42, (0, 0, 2, 1), (1, 0), direction, 0.125)
            self.assertEqual(xtest.XTestFakeButtonEvent.call_args_list, [mock.call(1, code, down, 0) for _ in range(2) for down in (1, 0)])
            xtest.XTestFakeKeyEvent.assert_not_called()

    def test_failed_and_cancelled_press_release_before_stopping(self):
        import native_cancel as cancel
        for failure in ('press', 'cancel'):
            with self.subTest(failure=failure), mock.patch.object(cancel, '_requested', False):
                client, xtest = self.prepared()
                if failure == 'press':
                    xtest.XTestFakeButtonEvent.side_effect = [0, 1]
                else:
                    def signal_on_down(_display, _code, down, _delay):
                        if down:
                            cancel.handle_signal(None, None)
                        return 1
                    xtest.XTestFakeButtonEvent.side_effect = signal_on_down
                with self.assertRaises((RuntimeError, cancel.OperationCancelled)):
                    client.scroll(42, (0, 0, 2, 1), (1, 0), 'down', 1)
                self.assertEqual(xtest.XTestFakeButtonEvent.call_args_list, [mock.call(1, 5, 1, 0), mock.call(1, 5, 0, 0)])

    def test_invalid_and_changed_target_send_no_wheel(self):
        for direction, pages in [('bad', 1), ('down', 0), ('down', True), ('down', float('nan')), ('down', float('inf'))]:
            client, xtest = self.prepared()
            with self.assertRaises(RuntimeError):
                client.scroll(42, (0, 0, 2, 1), (1, 0), direction, pages)
            client.prepare_pointer.assert_not_called()
            xtest.XTestFakeButtonEvent.assert_not_called()
        client, xtest = self.prepared()
        client.pointer.return_value = (99, 1, 0, 0)
        with self.assertRaisesRegex(RuntimeError, 'target changed'):
            client.scroll(42, (0, 0, 2, 1), (1, 0), 'down', 1)
        xtest.XTestFakeButtonEvent.assert_not_called()


if __name__ == '__main__':
    unittest.main()
