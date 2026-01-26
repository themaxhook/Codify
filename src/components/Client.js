import React from 'react';
import Avatar from 'react-avatar';

function getUserColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${hash % 360}, 85%, 65%)`;
}



const Client = ({ username }) => {
    return (
        <div className="client">
            <Avatar
                name={username}
                size="50"
                round="14px"
                color={getUserColor(username)}
            />
            <span className="userName">{username}</span>
        </div>
    );
};

export default Client;
