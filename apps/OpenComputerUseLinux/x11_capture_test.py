import struct
import types
import unittest
from unittest import mock
import zlib
import x11_capture as capture


class ImageTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
