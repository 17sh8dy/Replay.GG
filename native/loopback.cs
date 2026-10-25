// WASAPI loopback helper: captures what a Windows output device (speakers/headphones) is playing.
//   loopback.exe --list                      -> "id<TAB>name" per active output device (default first)
//   loopback.exe --pipe NAME [--device ID]   -> serves 48 kHz stereo s16le PCM on \\.\pipe\NAME
// ffmpeg has no WASAPI input, which is why this exists. When nothing is playing WASAPI delivers no
// packets at all, so the clock below pads with silence to keep the audio in step with the video.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading;
using System.Diagnostics;

static class Program
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int Item(int index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore props);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetAt(int index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
    }

    [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid fmtid; public int pid; }
    [StructLayout(LayoutKind.Sequential)] struct PropVariant { public ushort vt; ushort r1, r2, r3; public IntPtr ptr; public IntPtr ptr2; }

    [ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint flags, long bufferDuration, long periodicity, ref WaveFormatEx format, IntPtr sessionGuid);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(int shareMode, ref WaveFormatEx format, IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr h);
        [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpcPos);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    struct WaveFormatEx { public ushort tag, channels; public uint rate, bytesPerSec; public ushort blockAlign, bits, extra; }

    const int Render = 0, Console = 0, Active = 1;
    const int FlagLoopback = 0x00020000, FlagAutoConvert = unchecked((int)0x80000000), FlagSrcQuality = 0x08000000;
    const int Rate = 48000, Channels = 2, FrameBytes = 4; // s16le stereo
    static Guid PkeyFmt = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0");

    static IMMDeviceEnumerator NewEnumerator() { return (IMMDeviceEnumerator)new MMDeviceEnumeratorCom(); }

    static string NameOf(IMMDevice d)
    {
        IPropertyStore ps; d.OpenPropertyStore(0, out ps);
        PropertyKey key = new PropertyKey { fmtid = PkeyFmt, pid = 14 }; // PKEY_Device_FriendlyName
        PropVariant v; ps.GetValue(ref key, out v);
        return v.ptr == IntPtr.Zero ? "Audio device" : Marshal.PtrToStringUni(v.ptr);
    }

    static int List()
    {
        var en = NewEnumerator();
        string defId = null;
        IMMDevice def;
        if (en.GetDefaultAudioEndpoint(Render, Console, out def) == 0) def.GetId(out defId);
        IMMDeviceCollection col; en.EnumAudioEndpoints(Render, Active, out col);
        int n; col.GetCount(out n);
        var rows = new List<string>();
        for (int i = 0; i < n; i++)
        {
            IMMDevice d; col.Item(i, out d);
            string id; d.GetId(out id);
            string row = id + "\t" + NameOf(d);
            if (id == defId) rows.Insert(0, row); else rows.Add(row);
        }
        var o = new StreamWriter(System.Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false));
        foreach (var r in rows) o.WriteLine(r);
        o.Flush();
        return 0;
    }

    static int Serve(string pipe, string deviceId)
    {
        var en = NewEnumerator();
        IMMDevice dev = null;
        int hr = string.IsNullOrEmpty(deviceId) ? en.GetDefaultAudioEndpoint(Render, Console, out dev) : en.GetDevice(deviceId, out dev);
        if (hr != 0 && !string.IsNullOrEmpty(deviceId)) hr = en.GetDefaultAudioEndpoint(Render, Console, out dev); // device unplugged: fall back
        if (hr != 0) { System.Console.Error.WriteLine("no output device"); return 2; }

        Guid iidClient = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
        object o; dev.Activate(ref iidClient, 23, IntPtr.Zero, out o);
        var client = (IAudioClient)o;
        var fmt = new WaveFormatEx { tag = 1, channels = Channels, rate = Rate, bits = 16, blockAlign = FrameBytes, bytesPerSec = (uint)(Rate * FrameBytes) };
        hr = client.Initialize(0, unchecked((uint)(FlagLoopback | FlagAutoConvert | FlagSrcQuality)), 10000000, 0, ref fmt, IntPtr.Zero);
        if (hr != 0) { System.Console.Error.WriteLine("init failed 0x" + hr.ToString("X")); return 3; }
        Guid iidCap = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
        object cs; client.GetService(ref iidCap, out cs);
        var cap = (IAudioCaptureClient)cs;

        using (var server = new NamedPipeServerStream(pipe, PipeDirection.Out, 1, PipeTransmissionMode.Byte, PipeOptions.None, 65536, 65536))
        {
            System.Console.Out.WriteLine("ready"); System.Console.Out.Flush();
            server.WaitForConnection();
            client.Start();
            var clock = Stopwatch.StartNew();
            long written = 0; // frames sent so far
            long devFrames = 0, silentFrames = 0; int peak = 0;
            byte[] buf = new byte[1 << 16];
            try
            {
                while (true)
                {
                    uint pkt; cap.GetNextPacketSize(out pkt);
                    while (pkt > 0)
                    {
                        IntPtr data; uint frames, flags; ulong dp, qp;
                        if (cap.GetBuffer(out data, out frames, out flags, out dp, out qp) != 0) break;
                        int bytes = (int)frames * FrameBytes;
                        if (buf.Length < bytes) buf = new byte[bytes];
                        devFrames += frames;
                        if ((flags & 2) != 0) { silentFrames += frames; Array.Clear(buf, 0, bytes); } else { Marshal.Copy(data, buf, 0, bytes); for (int k = 0; k + 1 < bytes; k += 2) { int v = Math.Abs((int)BitConverter.ToInt16(buf, k)); if (v > peak) peak = v; } } // 2 = silent
                        cap.ReleaseBuffer(frames);
                        server.Write(buf, 0, bytes);
                        written += frames;
                        cap.GetNextPacketSize(out pkt);
                    }
                    long due = (long)(clock.Elapsed.TotalSeconds * Rate) - written;
                    if (due > Rate / 50) // 20 ms behind: nothing is playing, pad silence
                    {
                        int bytes = (int)Math.Min(due, Rate) * FrameBytes;
                        if (buf.Length < bytes) buf = new byte[bytes];
                        Array.Clear(buf, 0, bytes);
                        server.Write(buf, 0, bytes);
                        written += bytes / FrameBytes;
                    }
                    Thread.Sleep(5);
                }
            }
            catch (IOException) { /* ffmpeg closed the pipe: done */ }
            finally { client.Stop(); if (Environment.GetEnvironmentVariable("LOOPBACK_DEBUG") != null) System.Console.Error.WriteLine("device frames " + devFrames + " silent " + silentFrames + " peak " + peak); }
        }
        return 0;
    }

    static int Main(string[] a)
    {
        try
        {
            if (a.Length > 0 && a[0] == "--list") return List();
            string pipe = null, dev = null;
            for (int i = 0; i + 1 < a.Length; i++) { if (a[i] == "--pipe") pipe = a[i + 1]; if (a[i] == "--device") dev = a[i + 1]; }
            if (pipe == null) { System.Console.Error.WriteLine("usage: loopback --list | --pipe NAME [--device ID]"); return 1; }
            return Serve(pipe, dev);
        }
        catch (Exception e) { System.Console.Error.WriteLine(e.Message); return 4; }
    }
}
