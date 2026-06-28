//! Wire protocol shared by the host and the in-guest `cortex-init` agent.
//!
//! One host↔guest connection (over vsock) carries one exec session as a stream of
//! length-prefixed frames:
//!
//!   [kind: u8][len: u32 big-endian][payload: len bytes]
//!
//! The first frame is always `Exec`. `Data` carries raw PTY bytes both ways;
//! control frames (`Exec`, `Resize`, `Exit`) carry JSON. Keeping `Data` raw means
//! the hot path is a plain copy.

use std::io::{self, Read, Write};

use serde::{Deserialize, Serialize};

/// vsock port the guest agent listens on; the host reaches it through the UNIX
/// socket wired by `krun_add_vsock_port2`.
pub const AGENT_VSOCK_PORT: u32 = 1024;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FrameKind {
    Exec,
    Data,
    Resize,
    Exit,
}

impl FrameKind {
    fn to_u8(self) -> u8 {
        match self {
            FrameKind::Exec => 1,
            FrameKind::Data => 2,
            FrameKind::Resize => 3,
            FrameKind::Exit => 4,
        }
    }

    fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(FrameKind::Exec),
            2 => Some(FrameKind::Data),
            3 => Some(FrameKind::Resize),
            4 => Some(FrameKind::Exit),
            _ => None,
        }
    }
}

/// Request to start a command in the guest with a PTY (the first frame).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExecRequest {
    pub command: String,
    pub args: Vec<String>,
    /// Environment as KEY=VALUE strings.
    pub env: Vec<String>,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ResizeRequest {
    pub cols: u16,
    pub rows: u16,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct ExitNotice {
    pub code: i32,
}

pub fn write_frame(writer: &mut impl Write, kind: FrameKind, payload: &[u8]) -> io::Result<()> {
    writer.write_all(&[kind.to_u8()])?;
    writer.write_all(&(payload.len() as u32).to_be_bytes())?;
    writer.write_all(payload)?;
    writer.flush()
}

/// Read one frame. Returns `UnexpectedEof` at a clean end of stream.
pub fn read_frame(reader: &mut impl Read) -> io::Result<(FrameKind, Vec<u8>)> {
    let mut head = [0u8; 5];
    reader.read_exact(&mut head)?;
    let kind = FrameKind::from_u8(head[0])
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "unknown frame kind"))?;
    let len = u32::from_be_bytes([head[1], head[2], head[3], head[4]]) as usize;
    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload)?;
    Ok((kind, payload))
}

pub fn write_exec(writer: &mut impl Write, request: &ExecRequest) -> io::Result<()> {
    write_frame(writer, FrameKind::Exec, &to_json(request))
}

pub fn write_data(writer: &mut impl Write, bytes: &[u8]) -> io::Result<()> {
    write_frame(writer, FrameKind::Data, bytes)
}

pub fn write_resize(writer: &mut impl Write, request: &ResizeRequest) -> io::Result<()> {
    write_frame(writer, FrameKind::Resize, &to_json(request))
}

pub fn write_exit(writer: &mut impl Write, code: i32) -> io::Result<()> {
    write_frame(writer, FrameKind::Exit, &to_json(&ExitNotice { code }))
}

pub fn parse_exec(payload: &[u8]) -> io::Result<ExecRequest> {
    from_json(payload)
}

pub fn parse_resize(payload: &[u8]) -> io::Result<ResizeRequest> {
    from_json(payload)
}

pub fn parse_exit(payload: &[u8]) -> io::Result<ExitNotice> {
    from_json(payload)
}

fn to_json<T: Serialize>(value: &T) -> Vec<u8> {
    serde_json::to_vec(value).unwrap_or_default()
}

fn from_json<T: for<'de> Deserialize<'de>>(payload: &[u8]) -> io::Result<T> {
    serde_json::from_slice(payload).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_frames() {
        let mut buf = Vec::new();
        let exec = ExecRequest {
            command: "/bin/sh".into(),
            args: vec![],
            env: vec!["TERM=xterm-256color".into()],
            cwd: None,
            cols: 80,
            rows: 24,
        };
        write_exec(&mut buf, &exec).unwrap();
        write_data(&mut buf, b"hello").unwrap();
        write_resize(&mut buf, &ResizeRequest { cols: 100, rows: 40 }).unwrap();
        write_exit(&mut buf, 0).unwrap();

        let mut cursor = io::Cursor::new(buf);
        let (k, p) = read_frame(&mut cursor).unwrap();
        assert_eq!(k, FrameKind::Exec);
        assert_eq!(parse_exec(&p).unwrap().cols, 80);
        let (k, p) = read_frame(&mut cursor).unwrap();
        assert_eq!(k, FrameKind::Data);
        assert_eq!(p, b"hello");
        let (k, p) = read_frame(&mut cursor).unwrap();
        assert_eq!(k, FrameKind::Resize);
        assert_eq!(parse_resize(&p).unwrap().rows, 40);
        let (k, p) = read_frame(&mut cursor).unwrap();
        assert_eq!(k, FrameKind::Exit);
        assert_eq!(parse_exit(&p).unwrap().code, 0);
    }
}
