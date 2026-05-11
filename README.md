# Sky Bounce 3D

Three.js와 cannon-es로 만든 정적 웹 3D 바운스볼 게임입니다. `index.html`, `styles.css`, `src`, `vendor`만 있으면 배포 서버에서 바로 실행됩니다.

## 로컬 실행

```powershell
python -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 열면 됩니다.

## 배포

- Netlify, Vercel, GitHub Pages 같은 정적 호스팅에 이 폴더 전체를 업로드합니다.
- 빌드 명령은 필요 없습니다.
- 게시 디렉터리는 이 폴더의 루트입니다.

## 조작

- A/D 또는 좌우 방향키: 좌우 이동
- W/S 또는 위/아래 방향키: 앞/뒤 속도 조절
- Space: 추가 바운스
- P: 일시 정지
- 모바일: 화면 하단 방향 버튼과 `+` 버튼
