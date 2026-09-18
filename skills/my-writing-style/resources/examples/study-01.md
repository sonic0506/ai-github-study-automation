01. 파라미터 & 쿼리

- url 주소를 통해서 동적인 값을 받아올 때 사용함

- url 파라미터 : /profiles/1 => 정해진 특정 항목을 조회 할 때 주로 사용 (id가 1인 profile 조회, REST API)

- url 쿼리 : filter?type=book&sort_by=date  => 다양한 옵션을 줘서 검색할 때 주로 사용

​

​

02. url 파라미터

- Route 컴포넌트로 연결된 컴포넌트들은 기본 자식프로퍼티로 match 객체를 전달받을 수 있음

- math.params : url에서 파라미터를 받아 올 수 있게 해주는 프로퍼티, Route 컴포넌트에서 path 속성에서 컴포넌트 주소 이후에 ':'를 앞에 붙이면 ':'뒤에 이름을 가진 파라미터로 전달됨

​

​

<Profile.js - 부모Path : /profiles/:username>

import React from "react";

const profileData = {
  phg: {
    name: "박형규",
    description: "Front-end 지망생"
  },
  hong: {
    name: "홍길동",
    description: "신출귀몰 지망생"
  }
};

// Route컴포넌트 사용시 자동으로 match 프로퍼티가 전달됨
const Profile = ({ match }) => {
  // match.params : url 프로퍼티가 들어있음
  const { username } = match.params;
  const profile = profileData[username];

  if (!profile) {
    return <div>존재하지 않는 사용자입니다.</div>;
  }

  return (
    <div>
      <h3>
        {username} ({profile.name})
      </h3>
      <p>{profile.description}</p>
    </div>
  );
};

export default Profile;
​

​

03. url 쿼리

- Route 컴포넌트로 연결된 컴포넌트들은 기본 자식프로퍼티로 location 객체를 전달받을 수 있음

- location.search : 해당 컴포넌트의 url 뒷 부분의 쿼리를 전달 해주는 프로퍼티로 '?'같이 붙어서 전달되기 때문에 따로 파싱 작업이 필요함(qs 라이브러리 사용)

- qs.parse : 쿼리를 파싱해주는 메서드로 첫번째 인자로는 locaion.search를 두번째 인자로는 옵션값을 설정할 수 있음(ignoreQueryPrefix: true 를 전달하면 ?를 제거하고 배열로 파싱)

​

​

<About.js>

import React from "react";
import qs from "qs";

// 쿼리를 받기 위해서는 location객체를 전달받아야 함
const About = ({ location }) => {
  // location.search을 이용해 쿼리를 불러올 수 있음
  console.log(location)
  const query = qs.parse(location.search, {
    // 쿼리앞 ?를 제거
    ignoreQueryPrefix: true
  });

  // 쿼리는 전부 문자열로 받아옴(파싱해서 비교하거나 문자열로 비교)
  const detail = query.detail === "true";

  return (
    <div>
      <h1>About</h1>
      <p>리액트를 실습해보는 페이지 입니다.</p>
      {detail && <p>dtail 값이 true 입니다~~</p>}
    </div>
  );
};

export default About;
