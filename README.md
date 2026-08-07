# Yeecheck

날짜별 블록을 직접 입력하고 옮길 수 있는 로컬 시간 관리 웹앱이에요.

화면을 수정할 때는 [DESIGN.md](./DESIGN.md)의 디자인 원칙을 먼저 확인해요.

## 실행

```bash
npm install
npm run dev
```

터미널에 표시되는 로컬 주소를 브라우저에서 열면 돼요.

## 데이터

- 첫 실행 데이터는 `public/data.json`에 있어요.
- 편집한 데이터는 브라우저 안에 JSON 형태로 자동 저장돼요.
- 오른쪽 보관함의 내려받기 아이콘으로 현재 데이터를 `yeecheck-data.json` 파일로 저장할 수 있어요.
- 올리기 아이콘으로 같은 구조의 JSON 파일을 다시 불러올 수 있어요.

각 블록은 아래처럼 단순한 구조예요.

```json
{
  "id": "todo-1",
  "type": "todo",
  "title": "주간 리뷰",
  "date": "2026-08-07",
  "tags": ["work"],
  "completed": false,
  "repeat": "weekly",
  "parentId": null
}
```

`date`가 `null`이면 해당 블록은 오른쪽 보관함에 표시돼요.
